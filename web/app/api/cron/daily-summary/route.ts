import { NextRequest } from 'next/server';
import { handleCronRequest } from '@/lib/cronRuns';
import { sendDailySummaries } from '@/lib/shopNotify';
import { sendLowStockAlerts } from '@/lib/production/lowStock';

/**
 * Kunlik: do'kon egalariga bugungi savdo yakuni (Telegram, sozlamada yoqilganlarga) va
 * minimal qoldiqdan kam mahsulotlar ogohlantirishi (kirim/ishlab chiqarish moduli yoqilganlarga — lib/production/lowStock.ts)
 */
export async function GET(req: NextRequest) {
  return handleCronRequest(req, 'daily-summary', async () => {
    const summary = await sendDailySummaries();
    const lowStock = await sendLowStockAlerts();
    return { ...summary, lowStock };
  });
}
