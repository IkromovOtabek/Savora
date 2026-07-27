import { NextRequest, NextResponse } from 'next/server';
import { sendDailyInstallmentReminders } from '@/lib/installmentReminders';

/** Kunlik: muddati o'tgan nasiya to'lovlari — biznes egasiga Telegram xabarnoma */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '') ?? req.nextUrl.searchParams.get('secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await sendDailyInstallmentReminders();
  return NextResponse.json({ ok: true, ...result });
}
