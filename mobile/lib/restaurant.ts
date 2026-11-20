/**
 * Restoran (ofitsant) — mobil API turlari, so'rovlar, savat va polling.
 * Yagona manba: web/docs/RESTORAN_API.md §8 (`/api/mobile/restaurant/*`). Shakllar web lib/restaurant/{view,queries}.ts
 * bilan bir xil (mobil web kodini import qila olmaydi). To'lov mobil ilovada YO'Q — kassa (web).
 *
 * Idempotentlik: stol ochish — `clientOrderId`, taom qo'shish — har savat qatoriga savatga tushgan paytda
 * berilgan `clientItemId` (UUID). Sekin internetda takroriy yuborish yoki timeout'dan keyingi qayta urinish
 * serverda ikkinchi yozuv bermaydi (server `duplicates` qaytaradi).
 */
import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api, ApiError } from './api';
import { newClientSaleId } from './offline';
import { priceTimesQty } from './qty';
import { getDict, tr } from './i18n';

// «Hisoblar» ko'rinishi (sof funksiyalar — alohida faylda, testlanadi)
export { buildBills, linkedTakeaways, billRank, type BillRow, type BillsSummary } from './restaurantBills';

/* ───────────────────────────── turlar ───────────────────────────── */

export type OrderType = 'dine_in' | 'takeaway' | 'qr_self';
export type OrderStatus = 'open' | 'precheck' | 'paid' | 'cancelled';
export type ItemStatus = 'pending' | 'new' | 'sent' | 'cooking' | 'ready' | 'served' | 'voided';
export type CallKind = 'waiter' | 'bill';

export interface BillCounts { items: number; pending: number; unsent: number; active: number; ready: number; voided: number; unpaid: number }

export interface OrderSummary {
  id: string;
  orderNo: string;
  type: OrderType;
  status: OrderStatus;
  source: 'waiter' | 'qr' | 'cashier';
  tableId: string | null;
  tableNumber: number | null;
  /** Saboy qaysi stol mehmonlariga (faqat ma'lumot — stol bandligiga ta'sir qilmaydi) */
  forTableId: string | null;
  forTableNumber: number | null;
  guests: number | null;
  waiterId: string | null;
  waiterName: string | null;
  openedAt: string | null;
  precheckAt: string | null;
  updatedAt: string | null;
  /** false — boshqa ofitsant stoli (summalar yashirin) */
  access: boolean;
  mine: boolean;
  total: number | null;
  due: number | null;
  counts: BillCounts | null;
}

export interface TableRow {
  id: string;
  hallId: string;
  number: number;
  seats: number;
  calls: { waiterAt: string | null; billAt: string | null };
  /** null — bo'sh stol */
  order: OrderSummary | null;
  /** Yaqin bron (≤ 60 daqiqa yoki mehmon kechikmoqda); eski server — yo'q */
  reservation?: { id: string; startAt: string; time: string; customerName: string; guests: number; late: boolean } | null;
}

export interface TablesBoard {
  serverTime: string;
  branchId: string;
  /** Admin uchun filiallar (filial xodimiga — bo'sh) */
  branches: { id: string; name: string; isMain: boolean }[];
  halls: { id: string; name: string; sort: number }[];
  tables: TableRow[];
  /** Stolsiz ochiq buyurtmalar (saboy) */
  takeaway: OrderSummary[];
}

export interface OrderModifier { group: string; name: string; price: number }

export interface OrderItem {
  id: string;
  clientItemId: string | null;
  productId: string;
  name: string;
  /** «Osh (Katta, Achchiq)» */
  displayName: string;
  price: number;
  qty: number;
  unit: string | null;
  total: number;
  modifiers: OrderModifier[];
  note: string | null;
  stationId: string | null;
  stationKind: 'kitchen' | 'bar' | null;
  status: ItemStatus;
  fromQr: boolean;
  addedBy: string;
  addedAt: string | null;
  sentAt: string | null;
  cookStartedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  /** unsent — yuborilmagan; beforeCook — ombor qaytdi; afterCook — yo'qotish */
  voidStage: 'unsent' | 'beforeCook' | 'afterCook' | null;
  paid: boolean;
  timings: { waitMs: number | null; prepMs: number | null; deliveryMs: number | null; totalMs: number | null };
}

export interface OrderCan {
  view: boolean; edit: boolean; send: boolean; voidUnsent: boolean; voidSent: boolean; serve: boolean;
  transfer: boolean; precheck: boolean; reopen: boolean; pay: boolean; split: boolean; discount: boolean; cancel: boolean;
}

export interface OrderView {
  id: string;
  orderNo: string;
  branchId: string;
  type: OrderType;
  source: 'waiter' | 'qr' | 'cashier';
  status: OrderStatus;
  tableId: string | null;
  tableNumber: number | null;
  /** Zal nomi (pre-chekda) */
  hallName: string | null;
  /** Saboy qaysi stol mehmonlariga (null — bog'lanmagan) */
  forTableId: string | null;
  forTableNumber: number | null;
  guests: number | null;
  waiterId: string | null;
  waiterName: string | null;
  note: string | null;
  serviceChargePct: number;
  packFee: number;
  /** Do'kon sozlamasi: yuborilgan taomni bekor qilishda sabab majburiy */
  requireVoidReason: boolean;
  openedAt: string | null;
  precheckAt: string | null;
  updatedAt: string | null;
  items: OrderItem[];
  bill: {
    subtotal: number; paid: number; dueSubtotal: number; dueServiceCharge: number; duePackFee: number;
    due: number; total: number; servicePct: number; counts: BillCounts;
  };
  can?: OrderCan;
}

export interface MenuOption { id: string; name: string; price: number }
export interface MenuGroup { id: string; name: string; required: boolean; min: number; max: number; options: MenuOption[] }
export interface MenuItem {
  id: string;
  name: string;
  price: number;
  photoUrl: string | null;
  category: string | null;
  kind: 'goods' | 'service' | 'bundle';
  unit: string | null;
  stopListed: boolean;
  /** Sotsa bo'ladigan miqdor; null — cheklovsiz */
  available: number | null;
  modifierGroups: MenuGroup[];
}
export interface Menu { branchId: string; categories: string[]; items: MenuItem[] }

export interface SendFailure { itemId: string; name: string; reason: string; message: string }

/* ───────────────────────────── API ───────────────────────────── */

const BASE = '/api/mobile/restaurant';
const q = (branchId?: string | null) => (branchId ? `?branchId=${encodeURIComponent(branchId)}` : '');
type OrderOpBody =
  | { op: 'addItems'; items: { clientItemId: string; productId: string; qty: number; optionIds?: string[]; note?: string }[] }
  | { op: 'send'; itemIds?: string[] }
  | { op: 'served'; itemIds: string[] }
  | { op: 'void'; itemId: string; qty?: number; reason?: string }
  | { op: 'confirm'; itemIds?: string[]; reject?: boolean; send?: boolean }
  | { op: 'precheck' }
  /** forTableId — saboyning stoli (null — olib tashlash; faqat saboyda) */
  | { op: 'info'; guests?: number; note?: string; forTableId?: string | null }
  | { op: 'cancel'; reason?: string };

/** Server soati bilan farq (ms) — «necha daqiqa» hisobi telefon soati noto'g'ri bo'lsa ham to'g'ri chiqsin */
let skewMs = 0;
export const serverNow = () => Date.now() + skewMs;
/** Javobdagi `serverTime` bo'yicha farqni yangilash (so'rov yuborilgan va javob kelgan vaqt o'rtasi) */
function syncClock(serverTime: string | undefined, sentAt: number) {
  const t = serverTime ? new Date(serverTime).getTime() : NaN;
  if (Number.isFinite(t)) skewMs = t - Math.round((sentAt + Date.now()) / 2);
}

export const restaurantApi = {
  async tables(branchId?: string | null) {
    const sent = Date.now();
    const r = await api<TablesBoard>(`${BASE}/tables${q(branchId)}`);
    syncClock(r.serverTime, sent);
    return r;
  },
  ackCall: (tableId: string, kind?: CallKind) => api<{ tableId: string }>(`${BASE}/tables`, { method: 'POST', body: { op: 'ackCall', tableId, kind } }),
  menu: (branchId?: string | null) => api<Menu>(`${BASE}/menu${q(branchId)}`),
  /** `forTableId` — saboy qaysi stol mehmonlariga (ixtiyoriy, faqat takeaway) */
  open: (body: { type: 'dine_in' | 'takeaway'; tableId?: string; branchId?: string; guests?: number; clientOrderId: string; forTableId?: string }) =>
    api<{ order: OrderView; existing: boolean }>(`${BASE}/orders`, { method: 'POST', body }),
  async order(id: string) {
    const sent = Date.now();
    const r = await api<{ order: OrderView; serverTime?: string }>(`${BASE}/orders/${encodeURIComponent(id)}`);
    syncClock(r.serverTime, sent);
    return r;
  },
  op: <T extends { order: OrderView } = { order: OrderView }>(id: string, body: OrderOpBody) =>
    api<T>(`${BASE}/orders/${encodeURIComponent(id)}`, { method: 'POST', body }),
};

/** Idempotentlik kaliti (UUID; [A-Za-z0-9-], server 8–64 belgini qabul qiladi) */
export const newClientKey = newClientSaleId;

/** Tarmoq xatosi (server javob bermadi yoki vaqt tugadi) */
export const isNetErr = (e: unknown) => e instanceof ApiError && e.status === 0;
export const errCode = (e: unknown) => (e instanceof ApiError ? e.code : undefined);
/** `sendFailed` xatosidagi yoki muvaffaqiyatli javobdagi yuborilmagan taomlar */
export function failedOf(e: unknown): SendFailure[] {
  const f = e instanceof ApiError ? e.details?.failed : undefined;
  return Array.isArray(f) ? (f as SendFailure[]) : [];
}

/* ───────────────────────────── vaqt ───────────────────────────── */

/** ISO → "14:05" */
export function fmtClock(iso?: string | null): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

/** Davomiylik: "5 daq", "1 soat 12 daq" (null → '—') */
export function fmtDur(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '—';
  const r = getDict().restaurant;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return r.lessMin;
  if (min < 60) return tr(r.min, { n: min });
  return tr(r.hourMin, { h: Math.floor(min / 60), m: min % 60 });
}

/** ISO dan hozirgacha (server soati bo'yicha) */
export function sinceMs(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.max(0, serverNow() - t) : null;
}

/* ───────────────────────────── savat ───────────────────────────── */

export interface CartLine {
  /** Savatga tushgan paytdagi barqaror kalit — server uchun `clientItemId` */
  key: string;
  productId: string;
  name: string;
  /** Asosiy narx + tanlangan modifikatorlar */
  unitPrice: number;
  qty: number;
  optionIds: string[];
  /** Ko'rinish uchun: «Katta, Achchiq» */
  optionNames: string[];
  note: string;
}

export const lineTotal = (l: Pick<CartLine, 'unitPrice' | 'qty'>) => priceTimesQty(l.unitPrice, l.qty);
export const cartTotal = (lines: readonly CartLine[]) => lines.reduce((s, l) => s + lineTotal(l), 0);
export const cartCount = (lines: readonly CartLine[]) => lines.reduce((s, l) => s + l.qty, 0);

/**
 * Savat buyurtma bo'yicha xotirada saqlanadi: menyudan chiqib qaytganda yoki yuborish xato bo'lganda
 * yo'qolmaydi (ilova yopilsa — tozalanadi; oflayn navbat hozircha yo'q).
 */
const carts = new Map<string, CartLine[]>();
export const getCart = (orderId: string): CartLine[] => carts.get(orderId) ?? [];
export function setCart(orderId: string, lines: CartLine[]) {
  if (lines.length) carts.set(orderId, lines);
  else carts.delete(orderId);
}

/** Bir xil taom (modifikator va izohi bir xil) — miqdorni oshiramiz, aks holda yangi qator */
export function addToCart(lines: CartLine[], add: Omit<CartLine, 'key'>): CartLine[] {
  const same = (l: CartLine) =>
    l.productId === add.productId && l.note === add.note && l.optionIds.join(',') === add.optionIds.join(',');
  const hit = lines.find(same);
  if (hit) return lines.map((l) => (l === hit ? { ...l, qty: l.qty + add.qty } : l));
  return [...lines, { ...add, key: newClientKey() }];
}

/* ───────────────────────────── modifikatorlar ───────────────────────────── */

/** Guruh tanlovi chegaralari (server resolveModifiers bilan bir xil) */
export function groupBounds(g: MenuGroup): { min: number; max: number } {
  const min = g.required ? Math.max(1, g.min ?? 1) : Math.max(0, g.min ?? 0);
  return { min, max: Math.max(1, g.max ?? 1) };
}

/** Tanlov to'g'rimi; xato bo'lsa — birinchi mos kelmagan guruh nomi */
export function invalidGroup(groups: readonly MenuGroup[], picked: ReadonlySet<string>): string | null {
  for (const g of groups) {
    const n = g.options.filter((o) => picked.has(o.id)).length;
    const b = groupBounds(g);
    if (n < b.min || n > b.max) return g.name;
  }
  return null;
}

/* ───────────────────────────── polling ───────────────────────────── */

/**
 * Ekran fokusda va ilova faol bo'lganda har `ms` da `fn`; boshqa ekrandan qaytganda darhol ham
 * (birinchi ochilishda — yo'q: dastlabki yuklashni ekranning o'zi qiladi).
 * Ilova fonga o'tsa — to'xtaydi (batareya va trafik).
 */
export function usePolling(fn: () => void, ms = 5000) {
  const ref = useRef(fn);
  ref.current = fn;
  const focusedBefore = useRef(false);
  useFocusEffect(useCallback(() => {
    if (focusedBefore.current) ref.current();
    focusedBefore.current = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => ref.current(), ms); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') { ref.current(); start(); } else stop();
    });
    return () => { stop(); sub.remove(); };
  }, [ms]));
}
