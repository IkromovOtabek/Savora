/**
 * Ofitsant kabineti «Mening kunim» (server): joriy xodimning (`Order.waiterId = user.id`) davrdagi natijasi — yopilgan
 * hisoblar, sotuv, o'rtacha chek, mehmonlar, xizmat haqi, bekor qilingan taomlar; hozir ochiq stollari va davrda yopilgan
 * hisoblari ro'yxati.
 *
 * Hisob-kitob restoran hisobotlari bilan BIR XIL (reports.ts → closedOrdersData, summarizeSales, voidRows):
 *  - hisob — davrda YOPILGAN (status paid, paidAt) buyurtma; bo'lib to'langan hisob — bitta, puli — barcha qismlari;
 *  - pul — Sale qatorlaridan (bekor qilingan Sale kirmaydi, qaytarish kamaytiradi), xizmat haqi — «XIZMAT» qatorlari;
 *  - bekor qilingan taom — davrda (voidedAt) oshxonaga YUBORILGANDAN keyin bekor qilingani (yuborilmagani — tuzatish, kirmaydi).
 * Davr — Toshkent kuni (UTC+5) bo'yicha, server vaqt zonasidan qat'i nazar: bugun / hafta (bugun bilan 7 kun) / oy (30 kun).
 * Faqat O'Z ma'lumoti: boshqa ofitsantni tanlash parametri yo'q. Filial: xodim — o'z filiali; egasi — barcha yoki tanlangan.
 * Web: /app/tables/me (server komponent); mobil: GET /api/mobile/restaurant/waiter-day. Hujjat: docs/RESTORAN_API.md §17.
 */
import type { OrderDoc } from '../models/tenant/Order';
import { tashkentDayKey, tashkentPeriodRange } from '../period';
import { staffName } from '../staffNames';
import { needFeature, needPerm, ok, type OpResult, type RestaurantCtx } from './context';
import { staffNamesFor } from './ops';
import { orderSummary, type OrderSummary } from './view';
import { REPORT_LIMITS, closedOrdersData, reportScope, summarizeSales, voidRows, type ClosedOrder, type OrderMoney, type VoidRow } from './reports';
import type { OrderType } from './types';

export const WAITER_DAY_PERIODS = ['today', 'week', 'month'] as const;
export type WaiterDayPeriod = (typeof WAITER_DAY_PERIODS)[number];

/** Noma'lum qiymat — bugun */
export function parseWaiterDayPeriod(v: unknown): WaiterDayPeriod {
  return (WAITER_DAY_PERIODS as readonly unknown[]).includes(v) ? (v as WaiterDayPeriod) : 'today';
}

/** [from, to) — Toshkent kuni chegaralari; `fromDay`/`toDay` — birinchi va oxirgi kun (ikkalasi ham kiradi) */
export function waiterDayRange(period: WaiterDayPeriod, now = new Date()): { from: Date; to: Date; fromDay: string; toDay: string } {
  const { start, end } = tashkentPeriodRange(period, now);
  return { from: start, to: end, fromDay: tashkentDayKey(start), toDay: tashkentDayKey(new Date(end.getTime() - 1)) };
}

/** Ro'yxatda ko'rsatiladigan yopilgan hisoblar soni (jami — `totals.orders`) */
export const WAITER_CLOSED_SHOWN = 100;
/** Ochiq stollar (bitta ofitsantda amalda 10–20 ta) */
const MAX_OPEN = 100;

export interface WaiterDayTotals {
  /** Yopilgan hisoblar */
  orders: number;
  /** Sotuv (xizmat haqi va qadoq bilan) */
  revenue: number;
  avgCheck: number;
  guests: number;
  /** Mehmon soni kiritilmagan hisoblar */
  guestsMissing: number;
  serviceCharge: number;
  /** Oshxonaga yuborilgandan keyin bekor qilingan taomlar (qatorlar) */
  voids: number;
  voidAmount: number;
  /** Shulardan pishgandan keyin (yo'qotish) */
  lossCount: number;
}

export interface WaiterClosedBill {
  id: string;
  orderNo: string;
  type: OrderType;
  tableNumber: number | null;
  guests: number | null;
  paidAt: string | null;
  /** Hisob summasi (barcha to'lov qismlari, xizmat haqi bilan) */
  total: number;
}

export interface WaiterDay {
  period: WaiterDayPeriod;
  from: string;
  to: string;
  fromDay: string;
  toDay: string;
  /** Ofitsantning ko'rinadigan ismi */
  name: string;
  serverTime: string;
  totals: WaiterDayTotals;
  /** Hozir ochiq (open/precheck) buyurtmalarim — davrdan qat'i nazar; stollar raqam bo'yicha, keyin saboy */
  open: OrderSummary[];
  /** Davrda yopilganlar — eng yangisi birinchi, ≤ WAITER_CLOSED_SHOWN */
  closed: WaiterClosedBill[];
  /** Hisobot chegarasidan (REPORT_LIMITS.orders) oshdi — jamlar to'liq emas */
  truncated: boolean;
}

/** Sof hisob: yopilgan buyurtmalar + puli + bekor qilinganlar → ko'rsatkichlar va ro'yxat */
export function summarizeWaiterDay(
  orders: ClosedOrder[],
  money: Map<string, OrderMoney>,
  voids: Pick<VoidRow, 'amount' | 'loss'>[],
  shown = WAITER_CLOSED_SHOWN,
): { totals: WaiterDayTotals; closed: WaiterClosedBill[] } {
  const s = summarizeSales(orders, money).totals;
  const totals: WaiterDayTotals = {
    orders: s.orders,
    revenue: s.revenue,
    avgCheck: s.avgCheck,
    guests: s.guests,
    guestsMissing: orders.filter((o) => !(o.guests && o.guests > 0)).length,
    serviceCharge: s.serviceCharge,
    voids: voids.length,
    voidAmount: voids.reduce((a, v) => a + v.amount, 0),
    lossCount: voids.filter((v) => v.loss).length,
  };
  const paidMs = (o: ClosedOrder) => (o.paidAt ? new Date(o.paidAt).getTime() : 0);
  const closed = [...orders]
    .sort((a, b) => paidMs(b) - paidMs(a))
    .slice(0, shown)
    .map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      type: o.type,
      tableNumber: o.tableNumber,
      guests: o.guests,
      paidAt: o.paidAt ? new Date(o.paidAt).toISOString() : null,
      total: money.get(o.id)?.revenue ?? 0,
    }));
  return { totals, closed };
}

/** Ochiq buyurtmalar tartibi: stollar raqami bo'yicha, keyin stolsizlar (saboy) ochilgan vaqti bo'yicha */
export function sortOpenOrders<T extends Pick<OrderSummary, 'tableNumber' | 'openedAt'>>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.tableNumber != null && b.tableNumber != null) return a.tableNumber - b.tableNumber;
    if (a.tableNumber != null) return -1;
    if (b.tableNumber != null) return 1;
    return String(a.openedAt ?? '').localeCompare(String(b.openedAt ?? ''));
  });
}

const OPEN_FIELDS = 'orderNo type status source tableId tableNumber guests waiterId waiterName openedAt updatedAt serviceChargePct packFee packFeePaid items.price items.qty items.status items.paidCheckoutId payments.total branchId';

/** «Mening kunim»: modul `tables` + huquq `order.create`; faqat joriy xodimning buyurtmalari */
export async function waiterDay(
  ctx: RestaurantCtx,
  input: { period?: unknown; branchId?: string | null; now?: Date } = {},
): Promise<OpResult<WaiterDay>> {
  const denied = needFeature(ctx, 'tables') ?? needPerm(ctx, 'order.create');
  if (denied) return denied;
  const period = parseWaiterDayPeriod(input.period);
  const now = input.now ?? new Date();
  const range = waiterDayRange(period, now);
  const scope = await reportScope(ctx, input.branchId);
  if (!scope.ok) return scope;
  // Faqat o'zi: waiterId — sessiyadagi foydalanuvchi (so'rovdan olinmaydi)
  const mine = { ...scope.data.match, waiterId: ctx.user.id };
  const names = await staffNamesFor(ctx);
  const [closed, voids, openDocs] = await Promise.all([
    closedOrdersData(ctx, mine, range.from, range.to, names, false),
    voidRows(ctx, mine, range.from, range.to),
    ctx.m.Order.find({ ...mine, status: { $in: ['open', 'precheck'] } })
      .select(OPEN_FIELDS)
      .sort({ openedAt: 1 })
      .limit(MAX_OPEN)
      .lean<OrderDoc[]>(),
  ]);
  const sum = summarizeWaiterDay(closed.orders, closed.money, voids.slice(0, REPORT_LIMITS.voids));
  return ok({
    period,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    fromDay: range.fromDay,
    toDay: range.toDay,
    name: staffName(names, ctx.user.username, ctx.user.id) ?? ctx.user.username,
    serverTime: now.toISOString(),
    totals: sum.totals,
    open: sortOpenOrders(openDocs.map((o) => orderSummary(o, ctx.user.id, true, names))),
    closed: sum.closed,
    truncated: closed.truncated,
  });
}
