import { NextRequest } from 'next/server';
import { handleCronRequest } from '@/lib/cronRuns';
import { sendReservationReminders } from '@/lib/restaurant/reservationReminders';

/** Har 5 daqiqada: boshlanishiga ≤ 30 daqiqa qolgan bronlar — ilova ichidagi bildirishnoma (docs/RESTORAN_API.md §18) */
export async function GET(req: NextRequest) {
  return handleCronRequest(req, 'reservation-reminders', async () => ({ ...(await sendReservationReminders()) }));
}
