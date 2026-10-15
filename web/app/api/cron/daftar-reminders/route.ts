import { NextRequest, NextResponse } from 'next/server';
import { cronSecretOk } from '@/lib/security';
import { sendDailyDaftarReminders } from '@/lib/daftarReminders';

/** Kunlik: daftar (qarz oldi-berdi) muddat eslatmalari — egaga Telegram, do'stga SMS */
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

  const result = await sendDailyDaftarReminders();
  return NextResponse.json({ ok: true, ...result });
}
