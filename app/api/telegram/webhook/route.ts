import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramTo } from '@/lib/telegram';
import { getMasterModels } from '@/lib/masterDb';

/** Telegram webhook — kelgan xabarlarga echo javob (bot sozlangan bo'lsa) */
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'Telegram webhook faqat POST qabul qiladi.',
    docs: '/super/systems#telegram',
  });
}

/** Do'kon Telegram'ini ulaydi: /start link_<orgId> */
async function handleLink(chatIdRaw: number | string, orgId: string): Promise<string> {
  try {
    const { Organization } = await getMasterModels();
    const org = await Organization.findByIdAndUpdate(
      orgId,
      { $set: { telegramChatId: String(chatIdRaw) } },
      { new: true }
    ).lean();
    if (!org) return 'Do\'kon topilmadi. Iltimos, paneldagi havoladan qaytadan urinib ko\'ring.';
    return `✅ "${org.name}" Telegram'ga ulandi.\n\nEndi obuna eslatmalari va parolni tiklash kodlari shu yerga keladi.`;
  } catch {
    return 'Ulashda xatolik. Birozdan keyin qayta urinib ko\'ring.';
  }
}

export async function POST(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ ok: true, skipped: true });

  try {
    const body = await req.json();
    const chatId = body?.message?.chat?.id;
    const text: string = body?.message?.text ?? '';

    if (chatId && text.startsWith('/start')) {
      const param = text.slice('/start'.length).trim();
      if (param.startsWith('link_')) {
        const orgId = param.slice('link_'.length);
        const reply = await handleLink(chatId, orgId);
        await sendTelegramTo(String(chatId), reply);
      } else {
        await sendTelegramTo(
          String(chatId),
          'Savora bot ishlayapti. Do\'koningizni ulash uchun panel → Kabinet → "Telegram ulash" tugmasidan foydalaning.'
        );
      }
    }
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: true });
}
