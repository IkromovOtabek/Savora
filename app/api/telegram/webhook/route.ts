import { NextRequest, NextResponse } from 'next/server';

/** Telegram webhook — kelgan xabarlarga echo javob (bot sozlangan bo'lsa) */
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'Telegram webhook faqat POST qabul qiladi.',
    docs: '/super/systems#telegram',
  });
}

export async function POST(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ ok: true, skipped: true });

  try {
    const body = await req.json();
    const chatId = body?.message?.chat?.id;
    const text = body?.message?.text;
    if (chatId && text === '/start') {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: 'Savora bot ishlayapti. Do\'kon paneli: https://savdopro.uz',
        }),
      });
    }
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: true });
}
