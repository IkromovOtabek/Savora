import { NextRequest } from 'next/server';
import { handleCronRequest } from '@/lib/cronRuns';
import { sendDailyInstallmentReminders } from '@/lib/installmentReminders';

/** Kunlik: muddati o'tgan nasiya to'lovlari — biznes egasiga Telegram xabarnoma */
export async function GET(req: NextRequest) {
  return handleCronRequest(req, 'installment-reminders', async () => ({ ...(await sendDailyInstallmentReminders()) }));
}
