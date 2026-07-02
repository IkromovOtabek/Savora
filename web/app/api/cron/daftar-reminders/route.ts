import { NextRequest, NextResponse } from 'next/server';
import { sendDailyDaftarReminders } from '@/lib/daftarReminders';

/** Kunlik: daftar (qarz oldi-berdi) muddat eslatmalari — egaga Telegram, do'stga SMS */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '') ?? req.nextUrl.searchParams.get('secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await sendDailyDaftarReminders();
  return NextResponse.json({ ok: true, ...result });
}
