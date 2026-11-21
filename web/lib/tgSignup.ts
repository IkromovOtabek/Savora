import { randomBytes } from 'crypto';
import { sealData, unsealData } from 'iron-session';
import { getMasterModels } from './masterDb';
import { buyerPhoneKey } from './ecom/group';
import { hitRateLimit } from './rateLimit';

/**
 * Telegram orqali ro'yxatdan o'tish (mobil ilova: xaridor yoki biznes). Native modul/OAuth kerak emas —
 * mavjud bot ishlatiladi va foydalanuvchining O'Z raqami Telegram kontakti orqali tasdiqlanadi:
 *   ilova: start → `t.me/<bot>?start=su_<nonce>` → bot raqam so'raydi → kontakt → ilova status'ni so'rab chipta oladi
 *   → ro'yxatdan o'tish so'roviga `tgTicket` qo'shadi (telefon tasdiqlangan, Telegram hisobi bog'lanadi).
 *
 * Xavfsizlik: nonce 192 bit tasodifiy, 15 daqiqa yashaydi (raqam kelgach — yana 30 daqiqa); kontakt faqat yuboruvchining o'z raqami bo'lsa
 * qabul qilinadi (contact.user_id === from.id); chipta SESSION_SECRET bilan shifrlangan va bir marta ishlatiladi.
 */

export const TG_SIGNUP_PREFIX = 'su_';
const TTL_MS = 15 * 60_000;
/** Raqam tasdiqlangach — ro'yxatdan o'tishni tugatish uchun vaqt (biznes ustasi 4 qadam) */
const DONE_TTL_MS = 30 * 60_000;
const NONCE_RE = /^[A-Za-z0-9_-]{32}$/;
const SECRET = process.env.SESSION_SECRET || 'dev-only-session-secret-change-in-prod-32ch';

export interface TgTicket {
  /** nonce — bir martalik ishlatishni tekshirish uchun */
  n: string;
  /** Telegram foydalanuvchi id */
  tg: string;
  /** Kanonik telefon (+998…) */
  p: string;
  /** Telegram'dagi ism (ixtiyoriy to'ldirish uchun) */
  nm: string;
}

export const isTgNonce = (v: unknown): v is string => typeof v === 'string' && NONCE_RE.test(v);

/** Yangi so'rov: ilova shu havolani ochadi. Bot sozlanmagan bo'lsa — null. */
export async function startTgSignup(ip: string): Promise<{ ok: true; nonce: string; url: string; expiresAt: Date } | { ok: false; error: 'notConfigured' | 'rateLimited' }> {
  const bot = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, '');
  if (!process.env.TELEGRAM_BOT_TOKEN || !bot) return { ok: false, error: 'notConfigured' };
  const rl = await hitRateLimit(`tg-signup-ip:${ip}`, 20, 60 * 60_000);
  if (!rl.ok) return { ok: false, error: 'rateLimited' };
  const nonce = randomBytes(24).toString('base64url'); // 32 belgi — start parametri 64 dan oshmaydi
  const expiresAt = new Date(Date.now() + TTL_MS);
  const { TgSignup } = await getMasterModels();
  await TgSignup.create({ nonce, status: 'pending', expiresAt });
  return { ok: true, nonce, url: `https://t.me/${bot}?start=${TG_SIGNUP_PREFIX}${nonce}`, expiresAt };
}

export type TgStatus =
  | { status: 'pending' }
  | { status: 'done'; ticket: string; name: string; phone: string }
  | { status: 'expired' };

/** Ilova so'rab turadi: raqam kelgach — chipta (shifrlangan, qolgan muddat bilan) */
export async function tgSignupStatus(nonce: string): Promise<TgStatus> {
  if (!isTgNonce(nonce)) return { status: 'expired' };
  const { TgSignup } = await getMasterModels();
  const doc = await TgSignup.findOne({ nonce }).lean();
  if (!doc || doc.status === 'used' || doc.expiresAt.getTime() <= Date.now()) return { status: 'expired' };
  if (doc.status !== 'done' || !doc.phone || !doc.telegramUserId) return { status: 'pending' };
  const ttl = Math.max(60, Math.floor((doc.expiresAt.getTime() - Date.now()) / 1000));
  const ticket = await sealData({ n: nonce, tg: doc.telegramUserId, p: doc.phone, nm: doc.name ?? '' } satisfies TgTicket, { password: SECRET, ttl });
  return { status: 'done', ticket, name: doc.name ?? '', phone: doc.phone };
}

/**
 * Chiptani tekshiradi (ishlatilmagan, muddati o'tmagan). Ro'yxatdan o'tish muvaffaqiyatli bo'lgach
 * `consumeTgTicket` chaqiriladi — xato bo'lsa (login band) foydalanuvchi Telegram'ni qaytadan o'tmasin.
 */
export async function verifyTgTicket(ticket: unknown): Promise<TgTicket | null> {
  if (typeof ticket !== 'string' || !ticket || ticket.length > 2000) return null;
  let t: TgTicket;
  try {
    t = await unsealData<TgTicket>(ticket, { password: SECRET });
  } catch {
    return null;
  }
  if (!t || !isTgNonce(t.n) || !t.tg || !t.p) return null;
  const { TgSignup } = await getMasterModels();
  const ok = await TgSignup.exists({ nonce: t.n, status: 'done', telegramUserId: t.tg, phone: t.p, expiresAt: { $gt: new Date() } });
  return ok ? t : null;
}

export async function consumeTgTicket(t: TgTicket): Promise<void> {
  const { TgSignup } = await getMasterModels();
  await TgSignup.updateOne({ nonce: t.n, status: 'done' }, { $set: { status: 'used' } });
}

/* ───────────── Bot tomoni (app/api/telegram/webhook) ───────────── */

export type BotReply = { text: string; askContact?: boolean; restoreMenu?: boolean };

/** /start su_<nonce> — so'rovni shu Telegram foydalanuvchisiga biriktiradi va raqam so'raydi */
export async function botStartSignup(nonce: string, telegramUserId: string, chatId: string): Promise<BotReply> {
  const expired: BotReply = { text: '⛔️ Havola eskirgan. Savora ilovasida «Telegram orqali» tugmasini qaytadan bosing.', restoreMenu: true };
  if (!isTgNonce(nonce)) return expired;
  const { TgSignup } = await getMasterModels();
  // Faqat hali hech kimga biriktirilmagan (yoki o'shaning o'ziga) — begona havolani boshqasi «egallab» ololmasin
  const doc = await TgSignup.findOneAndUpdate(
    {
      nonce, status: 'pending', expiresAt: { $gt: new Date() },
      $or: [{ telegramUserId: { $exists: false } }, { telegramUserId }],
    },
    { $set: { telegramUserId, chatId } },
    { new: true },
  ).lean();
  if (!doc) return expired;
  return {
    text: '📲 <b>Savora</b> ilovasida ro\'yxatdan o\'tish.\n\nPastdagi <b>«📱 Raqamni yuborish»</b> tugmasini bosing — telefon raqamingiz tasdiqlanadi va ilovaga o\'tadi.\n\n<i>Agar buni siz boshlamagan bo\'lsangiz — raqamni yubormang.</i>',
    askContact: true,
  };
}

/** Kontakt keldi — faqat o'z raqami va kutilayotgan so'rov bo'lsa qabul qilinadi */
export async function botContact(
  telegramUserId: string,
  contact: { phone_number?: string; user_id?: number | string; first_name?: string; last_name?: string },
): Promise<BotReply | null> {
  const { TgSignup } = await getMasterModels();
  const doc = await TgSignup.findOne({ telegramUserId, status: 'pending', expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (!doc) return null; // boshqa maqsaddagi kontakt — e'tiborsiz
  if (String(contact.user_id ?? '') !== telegramUserId) {
    return { text: 'Iltimos, <b>o\'zingizning</b> raqamingizni pastdagi tugma orqali yuboring.', askContact: true };
  }
  const phone = buyerPhoneKey(contact.phone_number);
  if (!phone) return { text: '⛔️ Hozircha faqat O\'zbekiston raqamlari (+998) qabul qilinadi.', restoreMenu: true };
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim().replace(/\s+/g, ' ').slice(0, 80);
  doc.phone = phone;
  doc.name = name;
  doc.status = 'done';
  doc.expiresAt = new Date(Date.now() + DONE_TTL_MS);
  await doc.save();
  return { text: `✅ Raqam tasdiqlandi: <b>${phone}</b>\n\nEndi Savora ilovasiga qayting — ro'yxatdan o'tish davom etadi.`, restoreMenu: true };
}
