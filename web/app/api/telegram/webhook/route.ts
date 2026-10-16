import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramTo, sendTelegramWebApp, sendTelegramReplyMenu, tgEscape } from '@/lib/telegram';
import { getMasterModels } from '@/lib/masterDb';
import { safeEqual, verifyOrgLinkToken } from '@/lib/security';
import { logError, logInfo } from '@/lib/logger';
import { recordSecurityEvent, requestMeta } from '@/lib/securityEvents';

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const MINI_APP_URL = `${APP_BASE}/tg`;

/** Telegram webhook — kelgan xabarlarga echo javob (bot sozlangan bo'lsa) */
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'Telegram webhook faqat POST qabul qiladi.',
    docs: '/super/systems#telegram',
  });
}

/**
 * Webhook so'rovi haqiqatan Telegram'danmi — setWebhook'da berilgan `secret_token`
 * har so'rovda `X-Telegram-Bot-Api-Secret-Token` sarlavhasida keladi.
 * Production'da TELEGRAM_WEBHOOK_SECRET bo'lmasa — barcha so'rov rad etiladi.
 */
function isAuthenticWebhook(req: NextRequest): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') return false;
    console.warn('[telegram] TELEGRAM_WEBHOOK_SECRET o\'rnatilmagan — dev rejimida tekshiruvsiz qabul qilinmoqda.');
    return true;
  }
  return safeEqual(req.headers.get('x-telegram-bot-api-secret-token'), secret);
}

/**
 * Do'kon Telegram'ini ulaydi: /start link_<imzolangan token>.
 * Token Kabinet sahifasida yaratiladi (orgId + muddat + HMAC) — orgId'ni bilish yetarli emas.
 */
async function handleLink(chatIdRaw: number | string, token: string): Promise<string> {
  const secret = process.env.SESSION_SECRET || 'dev-only-session-secret-change-in-prod-32ch';
  const orgId = verifyOrgLinkToken(token, secret);
  if (!orgId) {
    return '⛔️ Havola eskirgan yoki noto\'g\'ri. Kabinet → "Telegram ulash" tugmasini qaytadan bosing.';
  }
  try {
    const { Organization } = await getMasterModels();
    const chatId = String(chatIdRaw);
    const org = await Organization.findByIdAndUpdate(
      orgId,
      { $set: { telegramChatId: chatId } },
      // `new: false` — eski telegramChatId qaytadi (chat almashganini aniqlash uchun)
      { new: false }
    ).lean();
    if (!org) return 'Do\'kon topilmadi. Iltimos, paneldagi havoladan qaytadan urinib ko\'ring.';
    const prevChat = org.telegramChatId ? String(org.telegramChatId) : '';
    if (prevChat && prevChat !== chatId) {
      // Eski chat egasi ulanish ko'chganini bilsin (best-effort, javobni kutmaymiz)
      void sendTelegramTo(prevChat, 'Savora: Telegram boshqa chatga ulandi.');
    }
    logInfo('telegram org linked', { orgId, chatChanged: !!prevChat && prevChat !== chatId });
    return `✅ "${tgEscape(org.name)}" Telegram'ga ulandi.\n\nEndi obuna eslatmalari va parolni tiklash kodlari shu yerga keladi.`;
  } catch {
    return 'Ulashda xatolik. Birozdan keyin qayta urinib ko\'ring.';
  }
}

/** Shaxsiy hisobni bog'laydi: /start lu_<code> (Mini App uchun) */
async function handleUserLink(telegramUserId: string, code: string): Promise<string> {
  try {
    const { TelegramAccount } = await getMasterModels();
    const acc = await TelegramAccount.findOne({ code }).exec();
    if (!acc || (acc.codeExpiresAt && acc.codeExpiresAt.getTime() < Date.now())) {
      return '⛔️ Havola eskirgan. Kabinetdan "Telegram hisobini bog\'lash" tugmasini qaytadan bosing.';
    }
    // Bu Telegram boshqa userga bog'langan bo'lsa — ko'chiramiz (oxirgi bog'lanish g'olib)
    await TelegramAccount.updateMany(
      { telegramUserId, _id: { $ne: acc._id } },
      { $unset: { telegramUserId: '' } }
    );
    acc.telegramUserId = telegramUserId;
    acc.linkedAt = new Date();
    acc.code = undefined;
    acc.codeExpiresAt = undefined;
    await acc.save();
    return `✅ "${tgEscape(acc.username)}" hisobi bog'landi.\n\nQuyidagi tugma orqali Savora ilovasini oching.`;
  } catch {
    return 'Bog\'lashda xatolik. Birozdan keyin qayta urinib ko\'ring.';
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthenticWebhook(req)) {
    recordSecurityEvent('telegram_forbidden', { ...requestMeta(req.headers), zone: 'api', path: '/api/telegram/webhook' });
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ ok: true, skipped: true });

  try {
    const body = await req.json();
    const chatId = body?.message?.chat?.id;
    const chatType: string = body?.message?.chat?.type ?? '';
    const fromId = body?.message?.from?.id;
    const text: string = body?.message?.text ?? '';

    const WELCOME =
      'Savora — do\'kon boshqaruv tizimi. Ilovani ochish uchun <b>“🚀 Savora’ni ochish”</b> tugmasini bosing.\n\nAgar "hisob bog\'lanmagan" chiqsa: panel → Kabinet → "Telegram hisobini bog\'lash".';

    if (chatId && text.startsWith('/start')) {
      const param = text.slice('/start'.length).trim();
      if (param.startsWith('link_')) {
        // Do'kon ulash faqat shaxsiy chatda — guruhda token ko'rinib, begona a'zo ulab yuborishi mumkin
        if (chatType !== 'private') {
          await sendTelegramTo(String(chatId), 'Do\'konni ulash faqat bot bilan shaxsiy chatda ishlaydi.');
        } else {
          const linkToken = param.slice('link_'.length);
          const reply = await handleLink(chatId, linkToken);
          await sendTelegramTo(String(chatId), reply);
        }
      } else if (param.startsWith('lu_') && fromId) {
        const code = param.slice('lu_'.length);
        const reply = await handleUserLink(String(fromId), code);
        await sendTelegramWebApp(String(chatId), reply, '🚀 Savora’ni ochish', MINI_APP_URL);
      } else {
        // Boshlang'ich /start — doimiy menyu (Savora'ni ochish + Boshlash)
        await sendTelegramReplyMenu(String(chatId), WELCOME, MINI_APP_URL);
      }
    } else if (chatId && text.trim() === 'Boshlash') {
      await sendTelegramReplyMenu(String(chatId), WELCOME, MINI_APP_URL);
    }
  } catch (err) {
    logError('telegram webhook failed', err);
  }
  return NextResponse.json({ ok: true });
}
