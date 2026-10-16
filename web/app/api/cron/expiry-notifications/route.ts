import { NextRequest } from 'next/server';
import { handleCronRequest } from '@/lib/cronRuns';
import { sendDailyExpiryNotifications } from '@/lib/notifications';

/** Kunlik: obunaga 2 kun qolganda Super Admin va foydalanuvchilarga xabar */
export async function GET(req: NextRequest) {
  return handleCronRequest(req, 'expiry-notifications', async () => ({ ...(await sendDailyExpiryNotifications()) }));
}
