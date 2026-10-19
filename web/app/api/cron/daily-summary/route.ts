import { NextRequest } from 'next/server';
import { handleCronRequest } from '@/lib/cronRuns';
import { sendDailySummaries } from '@/lib/shopNotify';

/** Kunlik: do'kon egalariga bugungi savdo yakuni (Telegram, sozlamada yoqilganlarga) */
export async function GET(req: NextRequest) {
  return handleCronRequest(req, 'daily-summary', async () => ({ ...(await sendDailySummaries()) }));
}
