/**
 * Restoran hisobotlari (server): oshxona tezligi (tayyorlanish/yetkazish — stansiya, taom, ofitsant),
 * ofitsant KPI, bekor qilinganlar (o'g'irlik nazorati, §1.4), savdo (zal/saboy/QR, top taomlar, soatlik yuklama).
 * Sahifa: /app/restaurant/reports; JSON: GET /api/restaurant/reports/overview; CSV: GET /api/restaurant/reports/export.
 *
 * Davr qoidalari:
 *  - vaqtlar — taom oshxonaga YUBORILGAN vaqt (sentAt) bo'yicha, stansiyasiz taom hisobga olinmaydi (timings.ts kabi);
 *  - bekor qilinganlar — voidedAt bo'yicha, faqat yuborilgandan keyingilari (voidStage beforeCook/afterCook);
 *  - savdo va KPI — davrda YOPILGAN (status paid, paidAt) buyurtmalar; pul — ularning Sale qatorlaridan:
 *    bekor qilingan Sale kirmaydi, qaytarish summani kamaytiradi (kassa va boshqa hisobotlar bilan bir xil).
 * Filial doirasi: filial xodimi — faqat o'z filiali (branchAggMatch); egasi — hammasi yoki tanlangan filial.
 * Indekslar: orders {branchId,status,updatedAt} (vaqt, bekor), {branchId,paidAt} (savdo); sales {orderId}.
 * DB qismi — aggregation; sof hisoblash (persentil, jamlash, CSV) — alohida eksport qilingan funksiyalar
 * (tests/restaurantReports.test.ts).
 */
import { Types } from 'mongoose';
import type { Dict } from '../i18n/dict';
import { tr } from '../i18n/fmt';
import { branchAggMatch } from '../branchScope';
import { isDayPeriod, periodRange, toDayKey } from '../period';
import { csvCell } from '../security';
import { fmtDateTime } from '../format';
import { durationStats, type DurationStats } from './timings';
import { fail, needFeature, needPerm, ok, type OpResult, type RestaurantCtx } from './context';
import { ORDER_STATUSES, ORDER_TYPES, type OrderType, type StationKind } from './types';

const DAY = 24 * 60 * 60 * 1000;
/** Eng uzun davr (kun) — vaqt hisoboti bilan bir xil */
export const REPORT_MAX_DAYS = 93;
/** Bitta hisobotdagi chegaralar (oshsa — `truncated`): yopilgan buyurtmalar, bekor qilingan qatorlar */
export const REPORT_LIMITS = { orders: 20_000, voids: 2_000 } as const;
const MAX_ORDERS = REPORT_LIMITS.orders;
const MAX_VOIDS = REPORT_LIMITS.voids;
/** «Taomlar bo'yicha» ro'yxati (eng sekinlari yuqorida) */
const MAX_DISHES = 50;
/** «Eng ko'p sotilgan» ro'yxati */
const TOP_SOLD = 15;
/** Tizim sotuv qatorlari (ops.ts → to'lov): xizmat haqi va qadoq — taom emas */
const SERVICE_IMEI = 'XIZMAT';
const PACK_IMEI = 'QADOQ';
const OBJECT_ID = /^[a-f0-9]{24}$/i;

/* ───────────────────────────── davr ───────────────────────────── */

export const REPORT_PERIODS = ['today', 'yesterday', 'week', 'month', 'range'] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];
const PRESETS = ['today', 'yesterday', 'week', 'month'] as const;

export interface ReportRange {
  period: ReportPeriod;
  /** [from, to) — server vaqti bo'yicha kun chegaralari (lib/period.ts bilan bir xil) */
  from: Date;
  to: Date;
  /** Oraliq tanlagich uchun: birinchi va oxirgi kun (YYYY-MM-DD, ikkalasi ham kiradi) */
  fromDay: string;
  toDay: string;
  /** Oraliq {REPORT_MAX_DAYS} kundan uzun edi — oxirgi {REPORT_MAX_DAYS} kun olindi */
  clamped: boolean;
}

/**
 * URL parametrlari → davr: `?from=YYYY-MM-DD&to=YYYY-MM-DD` (oraliq, ikkala kun ham kiradi) yoki
 * `?p=today|yesterday|week|month` (sukut — bugun). Teskari oraliq almashtiriladi, uzun oraliq qisqartiriladi.
 */
export function parseReportRange(q: { p?: string | null; from?: string | null; to?: string | null }, now = new Date()): ReportRange {
  const mk = (period: ReportPeriod, from: Date, to: Date, clamped = false): ReportRange => ({
    period, from, to, fromDay: toDayKey(from), toDay: toDayKey(new Date(to.getTime() - 1)), clamped,
  });
  if (isDayPeriod(q.from) && isDayPeriod(q.to)) {
    const [a, b] = q.from <= q.to ? [q.from, q.to] : [q.to, q.from];
    const to = periodRange(b).end;
    const min = new Date(to);
    min.setDate(min.getDate() - REPORT_MAX_DAYS);
    const start = periodRange(a).start;
    return start < min ? mk('range', min, to, true) : mk('range', start, to);
  }
  const p = PRESETS.find((k) => k === q.p) ?? 'today';
  const r = periodRange(p, now);
  return mk(p, r.start, r.end);
}

/* ───────────────────────────── turlar ───────────────────────────── */

export interface StationTiming { stationId: string; name: string | null; kind: StationKind | null; prep: DurationStats }
export interface DishTiming { productId: string; name: string; prep: DurationStats }
export interface WaiterDelivery { key: string; name: string; delivery: DurationStats }

export interface KitchenReport {
  /** yuborildi → tayyor */
  prep: DurationStats;
  /** tayyor → yetkazildi */
  delivery: DurationStats;
  /** Taomlar soni ko'p bo'yicha */
  byStation: StationTiming[];
  /** O'rtacha tayyorlanish vaqti uzun bo'yicha (eng sekinlari yuqorida), ≤50 */
  dishes: DishTiming[];
  /** O'rtacha yetkazish vaqti uzun bo'yicha */
  deliveryByWaiter: WaiterDelivery[];
}

export interface VoidRow {
  orderId: string;
  orderNo: string;
  tableNumber: number | null;
  type: OrderType;
  waiterName: string;
  name: string;
  qty: number;
  amount: number;
  voidedAt: string;
  voidedBy: string;
  reason: string;
  stage: 'beforeCook' | 'afterCook';
  /** Pishgandan keyin — ombordan chiqqan, puli olinmagan */
  loss: boolean;
}
export interface VoidTotals { count: number; amount: number; lossCount: number; lossAmount: number }
export interface VoidStaff extends VoidTotals { name: string }
export interface VoidReport {
  totals: VoidTotals;
  /** Yo'qotish summasi, keyin umumiy summa bo'yicha */
  byStaff: VoidStaff[];
  /** Eng yangisi birinchi */
  rows: VoidRow[];
  truncated: boolean;
}

export interface WaiterKpi {
  key: string;
  /** '' — ofitsantsiz (mijoz QR / kassa) */
  name: string;
  orders: number;
  revenue: number;
  avgCheck: number;
  guests: number;
  /** Mehmon soni kiritilgan buyurtmalar bo'yicha o'rtacha (0,1 aniqlikda); kiritilmagan bo'lsa — null */
  avgGuests: number | null;
  serviceCharge: number;
  /** Stol ochilgandan to'lovgacha o'rtacha */
  avgServiceMs: number | null;
}
export type SalesTotals = Omit<WaiterKpi, 'key' | 'name'>;
export interface ChannelRow { type: OrderType; orders: number; revenue: number; /** Tushumdagi ulush, % (butun) */ share: number }
export interface HourRow { hour: number; orders: number; revenue: number }
export interface DishSold { productId: string; name: string; qty: number; revenue: number }
export interface SalesReport {
  totals: SalesTotals;
  /** Tushum bo'yicha */
  byWaiter: WaiterKpi[];
  /** Har doim 3 qator: dine_in, takeaway, qr_self */
  byChannel: ChannelRow[];
  topDishes: DishSold[];
  /** 24 soat (0–23), server vaqti bo'yicha buyurtma ochilgan soat */
  hourly: HourRow[];
  truncated: boolean;
}

export interface RestaurantReport {
  from: string;
  to: string;
  /** null — barcha filiallar (faqat egasi) */
  branchId: string | null;
  /** Filtr uchun (egasiga; filial xodimiga — bo'sh) */
  branches: { id: string; name: string }[];
  kitchen: KitchenReport;
  voids: VoidReport;
  sales: SalesReport;
}

/* ───────────────────────────── sof hisoblash ───────────────────────────── */

/** Mongo guruhi: stansiya × taom × ofitsant kesimidagi davomiyliklar (ms) */
export interface KitchenGroup {
  stationId: string;
  productId: string;
  name: string;
  waiterKey: string;
  waiterName: string;
  prep: (number | null)[];
  delivery: (number | null)[];
}

function pushAll(target: number[], values: (number | null)[]): void {
  // Katta massivda spread (push(...a)) stekni to'ldiradi — oddiy sikl
  for (const v of values) if (typeof v === 'number' && v >= 0) target.push(v);
}

/** O'rtacha bo'yicha kamayish tartibi (null — oxirida), teng bo'lsa — soni ko'pi oldin */
function byAvgDesc(a: DurationStats, b: DurationStats): number {
  if (a.avgMs === null || b.avgMs === null) return (a.avgMs === null ? 1 : 0) - (b.avgMs === null ? 1 : 0);
  return b.avgMs - a.avgMs || b.count - a.count;
}

/** Guruhlarni stansiya / taom / ofitsant bo'yicha jamlaydi va statistikani (o'rtacha, mediana, p90) hisoblaydi */
export function summarizeKitchen(groups: KitchenGroup[], stations: Map<string, { name: string; kind: StationKind | null }>): KitchenReport {
  const allPrep: number[] = [];
  const allDelivery: number[] = [];
  const st = new Map<string, number[]>();
  const dish = new Map<string, { name: string; prep: number[] }>();
  const wt = new Map<string, { name: string; delivery: number[] }>();
  for (const g of groups) {
    pushAll(allPrep, g.prep);
    pushAll(allDelivery, g.delivery);
    const s = st.get(g.stationId) ?? [];
    pushAll(s, g.prep);
    st.set(g.stationId, s);
    const dsh = dish.get(g.productId) ?? { name: g.name, prep: [] };
    pushAll(dsh.prep, g.prep);
    dish.set(g.productId, dsh);
    const w = wt.get(g.waiterKey) ?? { name: g.waiterName, delivery: [] };
    if (!w.name && g.waiterName) w.name = g.waiterName;
    pushAll(w.delivery, g.delivery);
    wt.set(g.waiterKey, w);
  }
  return {
    prep: durationStats(allPrep),
    delivery: durationStats(allDelivery),
    byStation: [...st.entries()]
      .map(([stationId, v]) => ({ stationId, name: stations.get(stationId)?.name ?? null, kind: stations.get(stationId)?.kind ?? null, prep: durationStats(v) }))
      .sort((a, b) => b.prep.count - a.prep.count || (a.name ?? '').localeCompare(b.name ?? '')),
    dishes: [...dish.entries()]
      .map(([productId, v]) => ({ productId, name: v.name, prep: durationStats(v.prep) }))
      .filter((x) => x.prep.count > 0)
      .sort((a, b) => byAvgDesc(a.prep, b.prep))
      .slice(0, MAX_DISHES),
    deliveryByWaiter: [...wt.entries()]
      .map(([key, v]) => ({ key, name: v.name, delivery: durationStats(v.delivery) }))
      .filter((x) => x.delivery.count > 0)
      .sort((a, b) => byAvgDesc(a.delivery, b.delivery)),
  };
}

/** Bekor qilinganlar jami va xodim (kim bekor qildi) bo'yicha jamlama */
export function summarizeVoids(rows: Pick<VoidRow, 'voidedBy' | 'amount' | 'loss'>[]): { totals: VoidTotals; byStaff: VoidStaff[] } {
  const totals: VoidTotals = { count: 0, amount: 0, lossCount: 0, lossAmount: 0 };
  const staff = new Map<string, VoidStaff>();
  for (const r of rows) {
    const s = staff.get(r.voidedBy) ?? { name: r.voidedBy, count: 0, amount: 0, lossCount: 0, lossAmount: 0 };
    for (const t of [totals, s]) {
      t.count += 1;
      t.amount += r.amount;
      if (r.loss) { t.lossCount += 1; t.lossAmount += r.amount; }
    }
    staff.set(r.voidedBy, s);
  }
  return {
    totals,
    byStaff: [...staff.values()].sort((a, b) => b.lossAmount - a.lossAmount || b.amount - a.amount || b.count - a.count),
  };
}

/** Savdo hisobotidagi buyurtma (yopilgan) */
export interface SalesOrder {
  id: string;
  type: OrderType;
  waiterKey: string;
  waiterName: string;
  guests: number | null;
  openedAt: Date;
  paidAt: Date | null;
}
export interface OrderMoney { revenue: number; serviceCharge: number }

interface Acc { orders: number; revenue: number; guests: number; guestOrders: number; serviceCharge: number; timeSum: number; timeN: number }
const emptyAcc = (): Acc => ({ orders: 0, revenue: 0, guests: 0, guestOrders: 0, serviceCharge: 0, timeSum: 0, timeN: 0 });

function accAdd(a: Acc, o: SalesOrder, m: OrderMoney): void {
  a.orders += 1;
  a.revenue += m.revenue;
  a.serviceCharge += m.serviceCharge;
  if (o.guests && o.guests > 0) { a.guests += o.guests; a.guestOrders += 1; }
  if (o.paidAt) {
    const ms = new Date(o.paidAt).getTime() - new Date(o.openedAt).getTime();
    if (Number.isFinite(ms) && ms >= 0) { a.timeSum += ms; a.timeN += 1; }
  }
}

function accTotals(a: Acc): SalesTotals {
  return {
    orders: a.orders,
    revenue: a.revenue,
    avgCheck: a.orders ? Math.round(a.revenue / a.orders) : 0,
    guests: a.guests,
    avgGuests: a.guestOrders ? Math.round((a.guests / a.guestOrders) * 10) / 10 : null,
    serviceCharge: a.serviceCharge,
    avgServiceMs: a.timeN ? Math.round(a.timeSum / a.timeN) : null,
  };
}

/** Yopilgan buyurtmalar + ularning puli → ofitsant KPI, buyurtma turi, soatlik yuklama (soat — server vaqti) */
export function summarizeSales(orders: SalesOrder[], money: Map<string, OrderMoney>): Omit<SalesReport, 'topDishes' | 'truncated'> {
  const total = emptyAcc();
  const waiters = new Map<string, { name: string; acc: Acc }>();
  const channels = new Map<OrderType, { orders: number; revenue: number }>(ORDER_TYPES.map((t) => [t, { orders: 0, revenue: 0 }]));
  const hourly: HourRow[] = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenue: 0 }));
  for (const o of orders) {
    const m = money.get(o.id) ?? { revenue: 0, serviceCharge: 0 };
    accAdd(total, o, m);
    const w = waiters.get(o.waiterKey) ?? { name: o.waiterName, acc: emptyAcc() };
    accAdd(w.acc, o, m);
    waiters.set(o.waiterKey, w);
    const c = channels.get(o.type);
    if (c) { c.orders += 1; c.revenue += m.revenue; }
    const h = new Date(o.openedAt).getHours();
    if (h >= 0 && h < 24) { hourly[h].orders += 1; hourly[h].revenue += m.revenue; }
  }
  return {
    totals: accTotals(total),
    byWaiter: [...waiters.entries()]
      .map(([key, w]) => ({ key, name: w.name, ...accTotals(w.acc) }))
      .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders),
    byChannel: ORDER_TYPES.map((type) => {
      const c = channels.get(type)!;
      return { type, ...c, share: total.revenue > 0 ? Math.round((c.revenue / total.revenue) * 100) : 0 };
    }),
    hourly,
  };
}

/** Davomiylik: «7,5 daq» (10 daqiqagacha kasr bilan), «24 daq», «1 soat 5 daq»; yo'q — «—» */
export function fmtDuration(ms: number | null | undefined, t: { minutes: string; hoursMinutes: string }): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const min = ms / 60_000;
  if (min < 9.95) return tr(t.minutes, { n: String(Math.round(min * 10) / 10).replace('.', ',') });
  const m = Math.round(min);
  if (m < 60) return tr(t.minutes, { n: m });
  return tr(t.hoursMinutes, { h: Math.floor(m / 60), m: m % 60 });
}

/* ───────────────────────────── CSV ───────────────────────────── */

export const REPORT_CSV_SECTIONS = ['kitchen', 'staff', 'voids', 'sales'] as const;
export type ReportCsvSection = (typeof REPORT_CSV_SECTIONS)[number];

/** CSV uchun daqiqa (bir kasr, nuqta bilan — jadval dasturlari son sifatida o'qiydi) */
const csvMin = (ms: number | null) => (ms == null ? '' : (Math.round(ms / 6_000) / 10).toFixed(1));

/** Hisobot bo'limi → CSV matni (BOM'siz; route qo'shadi). Ustun nomlari — joriy tilda */
export function reportCsv(r: RestaurantReport, section: ReportCsvSection, d: Dict): string {
  const t = d.restaurant.reports;
  const c = t.csv;
  const types = d.restaurant.common.orderTypes;
  const rows: (string | number | null)[][] = [];
  const statRow = (s: DurationStats) => [s.count, csvMin(s.avgMs), csvMin(s.medianMs), csvMin(s.p90Ms), csvMin(s.maxMs)];
  const statHead = [t.colCount, c.avgMin, c.medianMin, c.p90Min, c.maxMin];
  if (section === 'kitchen') {
    rows.push([c.group, c.name, ...statHead]);
    rows.push([t.prepTime, t.total, ...statRow(r.kitchen.prep)]);
    rows.push([t.deliveryTime, t.total, ...statRow(r.kitchen.delivery)]);
    for (const s of r.kitchen.byStation) rows.push([t.byStation, s.name ?? '—', ...statRow(s.prep)]);
    for (const x of r.kitchen.dishes) rows.push([t.byDish, x.name, ...statRow(x.prep)]);
    for (const w of r.kitchen.deliveryByWaiter) rows.push([t.deliveryByWaiter, w.name || t.noWaiter, ...statRow(w.delivery)]);
  } else if (section === 'staff') {
    rows.push([t.colWaiter, t.colOrders, t.colRevenue, t.colAvgCheck, t.colGuests, t.colAvgGuests, t.colService, c.serviceTimeMin]);
    const line = (name: string, k: SalesTotals) => [name, k.orders, k.revenue, k.avgCheck, k.guests, k.avgGuests ?? '', k.serviceCharge, csvMin(k.avgServiceMs)];
    for (const w of r.sales.byWaiter) rows.push(line(w.name || t.noWaiter, w));
    rows.push(line(t.total, r.sales.totals));
  } else if (section === 'voids') {
    rows.push([t.colWhen, t.colWho, t.colOrder, c.table, t.colWaiter, t.colDish, t.colQty, t.colAmount, t.colStage, t.colReason]);
    for (const v of r.voids.rows) {
      rows.push([
        fmtDateTime(v.voidedAt), v.voidedBy, v.orderNo, v.tableNumber ?? types[v.type], v.waiterName || t.noWaiter, v.name, v.qty, v.amount,
        v.loss ? t.stageAfter : t.stageBefore, v.reason,
      ]);
    }
  } else {
    rows.push([c.group, c.name, t.colOrders, t.colRevenue, c.qty]);
    for (const ch of r.sales.byChannel) rows.push([t.channelTitle, types[ch.type], ch.orders, ch.revenue, '']);
    for (const x of r.sales.topDishes) rows.push([t.topTitle, x.name, '', x.revenue, x.qty]);
    for (const h of r.sales.hourly) if (h.orders) rows.push([t.hourlyTitle, `${String(h.hour).padStart(2, '0')}:00`, h.orders, h.revenue, '']);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

/* ───────────────────────────── DB ───────────────────────────── */

interface Scope {
  match: Record<string, unknown>;
  branchId: string | null;
  branches: { id: string; name: string }[];
}

/** Filial doirasi: xodim — o'z filiali (boshqasi so'ralsa — badBranch); egasi — tanlangan yoki barcha filiallar */
async function reportScope(ctx: RestaurantCtx, requested?: string | null): Promise<OpResult<Scope>> {
  if (ctx.user.role !== 'admin') {
    if (requested && requested !== ctx.user.branchId) return fail(ctx.d, 'badBranch');
    return ok({ match: branchAggMatch(ctx.user), branchId: ctx.user.branchId ?? null, branches: [] });
  }
  const list = await ctx.m.Branch.find({}).select('name active').sort({ createdAt: 1 }).lean();
  const branches = list.filter((b) => b.active !== false).map((b) => ({ id: String(b._id), name: b.name }));
  if (requested) {
    if (!OBJECT_ID.test(requested) || !list.some((b) => String(b._id) === requested)) return fail(ctx.d, 'badBranch');
    return ok({ match: { branchId: new Types.ObjectId(requested) }, branchId: requested, branches });
  }
  // Barcha filiallar: `$in` — {branchId, …} indekslari nuqtali oraliqlar bilan ishlaydi (nofaol filial tarixi ham)
  return ok({ match: list.length ? { branchId: { $in: list.map((b) => b._id) } } : {}, branchId: null, branches });
}

const isDate = (f: string) => ({ $eq: [{ $type: f }, 'date'] });
/** to − from (ms), belgisi yo'q yoki teskari (soat noto'g'ri) bo'lsa — null (timings.ts → itemTimings bilan bir xil) */
const span = (to: string, from: string) => ({
  $cond: [{ $and: [isDate(to), isDate(from), { $gte: [to, from] }] }, { $subtract: [to, from] }, null],
});
const dropNulls = (f: string) => ({ $filter: { input: f, cond: { $ne: ['$$this', null] } } });

async function kitchenGroups(ctx: RestaurantCtx, match: Record<string, unknown>, from: Date, to: Date): Promise<KitchenGroup[]> {
  const rows = await ctx.m.Order.aggregate<{
    _id: { s: Types.ObjectId; p: Types.ObjectId; w: string };
    name: string; waiterName?: string; prep: number[]; delivery: number[];
  }>([
    // updatedAt ≥ from: davrda yuborilgan taomli buyurtma shu paytdan keyin o'zgargan (indeks {branchId,status,updatedAt})
    { $match: { ...match, status: { $in: [...ORDER_STATUSES] }, updatedAt: { $gte: from }, openedAt: { $lt: to }, items: { $elemMatch: { sentAt: { $gte: from, $lt: to } } } } },
    { $project: { waiterId: 1, waiterName: 1, 'items.stationId': 1, 'items.productId': 1, 'items.name': 1, 'items.status': 1, 'items.sentAt': 1, 'items.readyAt': 1, 'items.servedAt': 1 } },
    { $unwind: '$items' },
    { $match: { 'items.status': { $ne: 'voided' }, 'items.stationId': { $type: 'objectId' }, 'items.sentAt': { $gte: from, $lt: to } } },
    { $group: {
      _id: { s: '$items.stationId', p: '$items.productId', w: { $ifNull: ['$waiterId', { $ifNull: ['$waiterName', ''] }] } },
      name: { $first: '$items.name' },
      waiterName: { $first: '$waiterName' },
      prep: { $push: span('$items.readyAt', '$items.sentAt') },
      delivery: { $push: span('$items.servedAt', '$items.readyAt') },
    } },
    { $project: { name: 1, waiterName: 1, prep: dropNulls('$prep'), delivery: dropNulls('$delivery') } },
  ]);
  return rows.map((g) => ({
    stationId: String(g._id.s),
    productId: String(g._id.p),
    name: g.name,
    waiterKey: String(g._id.w ?? ''),
    waiterName: g.waiterName ?? '',
    prep: g.prep,
    delivery: g.delivery,
  }));
}

async function voidRows(ctx: RestaurantCtx, match: Record<string, unknown>, from: Date, to: Date): Promise<VoidRow[]> {
  const rows = await ctx.m.Order.aggregate<{
    orderId: Types.ObjectId; orderNo: string; tableNumber?: number; type: OrderType; waiterName?: string;
    name: string; qty: number; price: number; voidedAt: Date; voidedBy?: string; reason?: string; stage: 'beforeCook' | 'afterCook';
  }>([
    { $match: { ...match, status: { $in: [...ORDER_STATUSES] }, updatedAt: { $gte: from }, openedAt: { $lt: to }, items: { $elemMatch: { status: 'voided', voidedAt: { $gte: from, $lt: to } } } } },
    { $unwind: '$items' },
    { $match: { 'items.status': 'voided', 'items.voidStage': { $in: ['beforeCook', 'afterCook'] }, 'items.voidedAt': { $gte: from, $lt: to } } },
    { $sort: { 'items.voidedAt': -1, _id: 1 } },
    { $limit: MAX_VOIDS + 1 },
    { $project: {
      _id: 0, orderId: '$_id', orderNo: 1, tableNumber: 1, type: 1, waiterName: 1,
      name: '$items.name', qty: '$items.qty', price: '$items.price', voidedAt: '$items.voidedAt',
      voidedBy: '$items.voidedBy', reason: '$items.voidReason', stage: '$items.voidStage',
    } },
  ]);
  return rows.map((v) => ({
    orderId: String(v.orderId),
    orderNo: v.orderNo,
    tableNumber: v.tableNumber ?? null,
    type: v.type,
    waiterName: v.waiterName ?? '',
    name: v.name,
    qty: v.qty,
    amount: Math.round(v.price * v.qty),
    voidedAt: new Date(v.voidedAt).toISOString(),
    voidedBy: v.voidedBy ?? '—',
    reason: v.reason ?? '',
    stage: v.stage,
    loss: v.stage === 'afterCook',
  }));
}

async function salesData(ctx: RestaurantCtx, match: Record<string, unknown>, from: Date, to: Date): Promise<SalesReport> {
  // Yopilgan buyurtmalar. `$type: 'date'` — qisman indeks {branchId, paidAt} (partialFilter paidAt $type date)
  // shu shartsiz tanlanmaydi (explain bilan tekshirilgan: aks holda filialning barcha buyurtmalari ko'rib chiqiladi)
  const docs = await ctx.m.Order.find({ ...match, status: 'paid', paidAt: { $type: 'date', $gte: from, $lt: to } })
    .select('type waiterId waiterName guests openedAt paidAt')
    .sort({ paidAt: -1 })
    .limit(MAX_ORDERS + 1)
    .lean();
  const truncated = docs.length > MAX_ORDERS;
  const orders: SalesOrder[] = docs.slice(0, MAX_ORDERS).map((o) => ({
    id: String(o._id),
    type: o.type,
    waiterKey: o.waiterId || o.waiterName || '',
    waiterName: o.waiterName ?? '',
    guests: o.guests ?? null,
    openedAt: o.openedAt,
    paidAt: o.paidAt ?? null,
  }));
  const money = new Map<string, OrderMoney>();
  let topDishes: DishSold[] = [];
  if (orders.length) {
    const [agg] = await ctx.m.Sale.aggregate<{
      byOrder: { _id: Types.ObjectId; revenue: number; serviceCharge: number }[];
      byProduct: { _id: Types.ObjectId; qty: number; revenue: number; name: string }[];
    }>([
      // indeks {orderId}; bekor qilingan Sale kirmaydi, qaytarish totalAmount/saleQuantity ni kamaytirgan
      { $match: { orderId: { $in: docs.slice(0, MAX_ORDERS).map((o) => o._id) }, status: { $ne: 'cancelled' } } },
      { $facet: {
        byOrder: [{ $group: {
          _id: '$orderId',
          revenue: { $sum: '$totalAmount' },
          serviceCharge: { $sum: { $cond: [{ $eq: ['$productSnapshot.imei', SERVICE_IMEI] }, '$totalAmount', 0] } },
        } }],
        byProduct: [
          { $match: { 'productSnapshot.imei': { $nin: [SERVICE_IMEI, PACK_IMEI] } } },
          { $group: {
            _id: '$productId',
            qty: { $sum: { $ifNull: ['$productSnapshot.saleQuantity', 1] } },
            revenue: { $sum: '$totalAmount' },
            name: { $first: '$productSnapshot.name' },
          } },
          { $sort: { qty: -1, revenue: -1, _id: 1 } },
          { $limit: TOP_SOLD },
        ],
      } },
    ]);
    for (const x of agg?.byOrder ?? []) money.set(String(x._id), { revenue: x.revenue, serviceCharge: x.serviceCharge });
    const top = agg?.byProduct ?? [];
    // Nom — mahsulotning hozirgi nomi (Sale'dagi nom modifikatorli bo'lishi mumkin: «Osh (Katta)»)
    const names = top.length
      ? await ctx.m.Product.find({ _id: { $in: top.map((x) => x._id) } }).setOptions({ withDeleted: true }).select('name').lean()
      : [];
    const nameById = new Map(names.map((p) => [String(p._id), p.name]));
    topDishes = top.map((x) => ({ productId: String(x._id), name: nameById.get(String(x._id)) ?? x.name, qty: Math.round(x.qty * 1000) / 1000, revenue: x.revenue }));
  }
  return { ...summarizeSales(orders, money), topDishes, truncated };
}

/** To'liq hisobot: modul `tables` + huquq `reports.view`; davr ≤ 93 kun */
export async function restaurantReport(ctx: RestaurantCtx, input: { from: Date; to: Date; branchId?: string | null }): Promise<OpResult<RestaurantReport>> {
  const denied = needFeature(ctx, 'tables') ?? needPerm(ctx, 'reports.view');
  if (denied) return denied;
  const { from, to } = input;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || !(from < to) || to.getTime() - from.getTime() > REPORT_MAX_DAYS * DAY) {
    return fail(ctx.d, 'badInput');
  }
  const scope = await reportScope(ctx, input.branchId);
  if (!scope.ok) return scope;
  const { match } = scope.data;
  const [groups, voids, sales, stations] = await Promise.all([
    kitchenGroups(ctx, match, from, to),
    voidRows(ctx, match, from, to),
    salesData(ctx, match, from, to),
    ctx.m.KitchenStation.find(match).select('name kind').lean(),
  ]);
  const stationInfo = new Map(stations.map((s) => [String(s._id), { name: s.name, kind: (s.kind ?? null) as StationKind | null }]));
  const voidList = voids.slice(0, MAX_VOIDS);
  return ok({
    from: from.toISOString(),
    to: to.toISOString(),
    branchId: scope.data.branchId,
    branches: scope.data.branches,
    kitchen: summarizeKitchen(groups, stationInfo),
    voids: { ...summarizeVoids(voidList), rows: voidList, truncated: voids.length > MAX_VOIDS },
    sales,
  });
}
