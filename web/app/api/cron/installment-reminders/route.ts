import { NextRequest, NextResponse } from 'next/server';
import { cronSecretOk } from '@/lib/security';
import { sendDailyInstallmentReminders } from '@/lib/installmentReminders';

/** Kunlik: muddati o'tgan nasiya to'lovlari — biznes egasiga Telegram xabarnoma */
export async function GET(req: NextRequest) {
  // Faqat `Authorization: Bearer` (timing-safe); ?secret= faqat dev'da
  const ok = cronSecretOk(
    req.headers.get('authorization'),
    req.nextUrl.searchParams.get('secret'),
    process.env.CRON_SECRET,
    process.env.NODE_ENV === 'production',
  );
  if (!ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await sendDailyInstallmentReminders();
  return NextResponse.json({ ok: true, ...result });
}
