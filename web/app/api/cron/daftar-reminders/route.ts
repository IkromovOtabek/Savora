import { NextRequest } from 'next/server';
import { handleCronRequest } from '@/lib/cronRuns';
import { sendDailyDaftarReminders } from '@/lib/daftarReminders';

/** Kunlik: daftar (qarz oldi-berdi) muddat eslatmalari — egaga Telegram, do'stga SMS */
export async function GET(req: NextRequest) {
  return handleCronRequest(req, 'daftar-reminders', async () => ({ ...(await sendDailyDaftarReminders()) }));
}
