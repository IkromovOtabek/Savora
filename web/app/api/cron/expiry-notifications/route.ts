import { NextRequest, NextResponse } from 'next/server';
import { sendDailyExpiryNotifications } from '@/lib/notifications';

/** Kunlik: obunaga 2 kun qolganda Super Admin va foydalanuvchilarga xabar */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '') ?? req.nextUrl.searchParams.get('secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await sendDailyExpiryNotifications();
  return NextResponse.json({ ok: true, ...result });
}
