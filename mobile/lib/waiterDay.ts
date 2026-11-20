/**
 * Ofitsant kabineti «Mening kunim» — mobil turlar va SOF yordamchilar (React / React Native importsiz,
 * `node --test` bilan tekshiriladi). Server: GET /api/mobile/restaurant/waiter-day (web lib/restaurant/waiterDay.ts,
 * docs/RESTORAN_API.md §17). Faqat o'chiriladigan TS sintaksisi — Node type stripping bilan to'g'ridan-to'g'ri ishlaydi.
 */
import type { BillCounts, OrderSummary, OrderType } from './restaurant';

export type WaiterDayPeriod = 'today' | 'week' | 'month';
export const WAITER_DAY_PERIODS: readonly WaiterDayPeriod[] = ['today', 'week', 'month'];

export interface WaiterDayTotals {
  /** Yopilgan hisoblar */
  orders: number;
  /** Sotuv (xizmat haqi bilan) */
  revenue: number;
  avgCheck: number;
  guests: number;
  /** Mehmon soni kiritilmagan hisoblar */
  guestsMissing: number;
  serviceCharge: number;
  /** Oshxonaga yuborilgandan keyin bekor qilingan taomlar */
  voids: number;
  voidAmount: number;
  /** Shulardan pishgandan keyin */
  lossCount: number;
}

export interface WaiterClosedBill {
  id: string;
  orderNo: string;
  type: OrderType;
  tableNumber: number | null;
  guests: number | null;
  paidAt: string | null;
  total: number;
}

export interface WaiterDay {
  period: WaiterDayPeriod;
  from: string;
  to: string;
  /** Toshkent kunlari (YYYY-MM-DD), ikkalasi ham kiradi */
  fromDay: string;
  toDay: string;
  name: string;
  serverTime: string;
  totals: WaiterDayTotals;
  /** Hozir ochiq stollarim (davrdan qat'i nazar) */
  open: OrderSummary[];
  /** Davrda yopilganlar, eng yangisi birinchi (≤ 100; jami — totals.orders) */
  closed: WaiterClosedBill[];
  truncated: boolean;
}

export const waiterDayPath = (p: WaiterDayPeriod) => `/api/mobile/restaurant/waiter-day?p=${p}`;

export type OpenBadgeKind = 'ready' | 'pending' | 'unsent' | 'precheck';
export interface OpenBadge { kind: OpenBadgeKind; n: number }

/**
 * Ochiq stol qatoridagi belgilar — muhimi birinchi: tayyor taom (olib borish kerak), mijoz QR taomi (tasdiqlash kerak),
 * yuborilmagan taom, pre-chek berilgan.
 */
export function openBadges(o: { status: string; counts: BillCounts | null }): OpenBadge[] {
  const out: OpenBadge[] = [];
  const c = o.counts;
  if (c && c.ready > 0) out.push({ kind: 'ready', n: c.ready });
  if (c && c.pending > 0) out.push({ kind: 'pending', n: c.pending });
  if (c && c.unsent > 0) out.push({ kind: 'unsent', n: c.unsent });
  if (o.status === 'precheck') out.push({ kind: 'precheck', n: 0 });
  return out;
}

/** Toshkent vaqti (UTC+5) — server davr chegaralari bilan bir xil */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');
function tk(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const t = new Date(new Date(iso).getTime() + TASHKENT_OFFSET_MS);
  return Number.isNaN(t.getTime()) ? null : t;
}

/** «14:05» */
export function tkClock(iso: string | null | undefined): string {
  const t = tk(iso);
  return t ? `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}` : '—';
}

/** «20.11 14:05» */
export function tkDayClock(iso: string | null | undefined): string {
  const t = tk(iso);
  return t ? `${pad(t.getUTCDate())}.${pad(t.getUTCMonth() + 1)} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}` : '—';
}

/** Davr yorlig'i: bitta kun — «20.11.2026», bir necha kun — «14.11 – 20.11» */
export function rangeLabel(fromDay: string, toDay: string): string {
  const short = (k: string) => `${k.slice(8, 10)}.${k.slice(5, 7)}`;
  return fromDay === toDay ? `${short(toDay)}.${toDay.slice(0, 4)}` : `${short(fromDay)} – ${short(toDay)}`;
}
