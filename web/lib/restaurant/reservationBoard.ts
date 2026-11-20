/**
 * Stollar taxtasi uchun yaqin bronlar (§18). Alohida modul — `queries.ts → tablesBoard` uni import qiladi;
 * `reservations.ts` esa `queries.ts` ni import qiladi, shuning uchun bu funksiya u yerda turmaydi (aylanma import bo'lmasin).
 */
import type { ReservationDoc } from '../models/tenant/Reservation';
import type { RestaurantCtx } from './context';
import { RESERVATION_LIMITS, isLate, tashkentClock } from './reservationRules';

export interface UpcomingReservation {
  id: string;
  /** ISO */
  startAt: string;
  /** Toshkent soati HH:MM */
  time: string;
  customerName: string;
  guests: number;
  /** Mehmon kechikmoqda (boshlanganiga 15 daqiqadan oshdi) */
  late: boolean;
}

const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

/**
 * Stol → eng yaqin `booked` bron. Oyna: boshlanishiga ≤ `windowMin` daqiqa qolgan yoki boshlanganiga
 * ≤ 30 daqiqa bo'lgan (kechikayotgan mehmon). Huquq yo'q / modul o'chiq / boshqa filial — bo'sh obyekt (taxta buzilmasin).
 * Kalit — stol id (TableBoardRow.id).
 */
export async function upcomingByTable(
  ctx: Pick<RestaurantCtx, 'features' | 'perms' | 'user'> & { m: Pick<RestaurantCtx['m'], 'Reservation'> },
  branchId: string,
  now: Date = new Date(),
  windowMin = 60,
): Promise<Record<string, UpcomingReservation>> {
  if (!ctx.features.tables || !validId(branchId)) return {};
  if (!(['order.create', 'order.viewAll', 'reservation.manage'] as const).some((k) => ctx.perms.has(k))) return {};
  if (ctx.user.role !== 'admin' && ctx.user.branchId !== branchId) return {};
  const list = await ctx.m.Reservation.find({
    branchId,
    status: 'booked',
    startAt: { $gte: new Date(now.getTime() - RESERVATION_LIMITS.boardGraceMin * 60_000), $lte: new Date(now.getTime() + windowMin * 60_000) },
  }).sort({ startAt: 1 }).select('tableId startAt customerName guests status').limit(500).lean<ReservationDoc[]>();
  const out: Record<string, UpcomingReservation> = {};
  for (const r of list) {
    const k = String(r.tableId);
    if (out[k]) continue;
    out[k] = { id: String(r._id), startAt: r.startAt.toISOString(), time: tashkentClock(r.startAt), customerName: r.customerName, guests: r.guests, late: isLate(r, now) };
  }
  return out;
}
