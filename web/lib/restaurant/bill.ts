/**
 * Restoran hisobi — sof hisob-kitob (DB importi yo'q; client va server bir xil ishlatadi).
 *
 * Qoidalar:
 *  - Qator jami = narx × miqdor, butun so'mga yaxlitlangan (lib/qty → priceTimesQty, POS bilan bir xil).
 *  - Hisobga kiradi: bekor qilinmagan va tasdiqlangan taomlar (pending — mijoz QR qo'shgan, tasdiqlanmagan — kirmaydi).
 *  - Xizmat haqi = (taomlar − chegirma) × foiz / 100, butun so'mga yaxlitlangan. Faqat zalda (dine_in);
 *    saboy va QR orqali o'zi buyurtmada — 0 (Raqobat qo'mitasi talabi: muqobil «o'zi xizmat» bo'lishi kerak).
 *  - Qadoq haqi — saboy buyurtmaga bir marta, birinchi to'lov qismida.
 *  - Teng bo'lish — faqat summalarni hisoblash (splitEqually); to'lov bitta so'rovda bir nechta `parts` bilan.
 */
import { priceTimesQty } from '../qty';
import { allocateDiscount, discountAmount, type CartDiscount } from '../posCart';
import { RESTAURANT_LIMITS, type ItemStatus, type OrderType } from './types';

export interface BillItemLike {
  price: number;
  qty: number;
  status: ItemStatus;
  paidCheckoutId?: string | null;
}

/** Qator jami (so'm) */
export function itemTotal(i: Pick<BillItemLike, 'price' | 'qty'>): number {
  return priceTimesQty(i.price, i.qty);
}

/** Hisobga kiradigan taom: bekor qilinmagan va mijoz QR'dan tasdiqlangan */
export function isBillable(i: Pick<BillItemLike, 'status'>): boolean {
  return i.status !== 'voided' && i.status !== 'pending';
}

/** Buyurtma turi bo'yicha amaldagi xizmat haqi foizi: faqat zalda, 0–30 oralig'ida */
export function effectiveServicePct(type: OrderType, pct: number | null | undefined): number {
  if (type !== 'dine_in') return 0;
  const n = Number(pct);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, RESTAURANT_LIMITS.maxServiceChargePct);
}

/** Xizmat haqi summasi (butun so'm) */
export function serviceChargeAmount(base: number, pct: number): number {
  if (!(pct > 0) || !(base > 0)) return 0;
  return Math.round((base * pct) / 100);
}

export interface PartTotals {
  /** Har taom qatori jami (chegirmasiz) */
  lineTotals: number[];
  /** Har qatorga tushgan chegirma (yig'indi = discount) */
  lineDiscounts: number[];
  subtotal: number;
  discount: number;
  serviceCharge: number;
  packFee: number;
  total: number;
}

/**
 * To'lov qismi (yoki butun buyurtma) summasi. Chegirma qatorlarga mutanosib bo'linadi (POS bilan bir xil),
 * xizmat haqi chegirmadan keyingi summadan olinadi. `null` — chegirma summadan katta yoki teng.
 */
export function computePartTotals(
  lines: Pick<BillItemLike, 'price' | 'qty'>[],
  opts: { servicePct: number; packFee?: number; discount?: CartDiscount | null },
): PartTotals | null {
  const lineTotals = lines.map(itemTotal);
  const subtotal = lineTotals.reduce((s, n) => s + n, 0);
  const discount = discountAmount(subtotal, opts.discount ?? null);
  if (discount > 0 && discount >= subtotal) return null;
  const lineDiscounts = allocateDiscount(lineTotals, discount);
  const base = subtotal - discount;
  const serviceCharge = serviceChargeAmount(base, opts.servicePct);
  const packFee = Math.max(0, Math.round(opts.packFee ?? 0));
  return { lineTotals, lineDiscounts, subtotal, discount, serviceCharge, packFee, total: base + serviceCharge + packFee };
}

export interface BillSummary {
  /** Hisobdagi barcha taomlar (to'langan + to'lanmagan) */
  subtotal: number;
  /** To'langan qismlar summasi (chegirma, xizmat, qadoq bilan) */
  paid: number;
  /** To'lanmagan taomlar */
  dueSubtotal: number;
  dueServiceCharge: number;
  duePackFee: number;
  /** Hozir to'lanadigan summa (chegirmasiz) */
  due: number;
  /** paid + due */
  total: number;
  servicePct: number;
  counts: { items: number; pending: number; unsent: number; active: number; ready: number; voided: number; unpaid: number };
}

/** Buyurtma hisobi (ro'yxat, pre-chek, to'lov oynasi) */
export function computeBill(order: {
  type: OrderType;
  serviceChargePct: number;
  packFee: number;
  packFeePaid?: boolean | null;
  items: BillItemLike[];
  payments?: { total: number }[];
}): BillSummary {
  const servicePct = effectiveServicePct(order.type, order.serviceChargePct);
  let subtotal = 0;
  let dueSubtotal = 0;
  const counts = { items: 0, pending: 0, unsent: 0, active: 0, ready: 0, voided: 0, unpaid: 0 };
  for (const i of order.items) {
    if (i.status === 'voided') { counts.voided += 1; continue; }
    if (i.status === 'pending') { counts.pending += 1; continue; }
    counts.items += 1;
    if (i.status === 'new') counts.unsent += 1;
    if (i.status === 'sent' || i.status === 'cooking') counts.active += 1;
    if (i.status === 'ready') counts.ready += 1;
    const t = itemTotal(i);
    subtotal += t;
    if (!i.paidCheckoutId) { dueSubtotal += t; counts.unpaid += 1; }
  }
  const paid = (order.payments ?? []).reduce((s, p) => s + (p.total || 0), 0);
  const dueServiceCharge = serviceChargeAmount(dueSubtotal, servicePct);
  const duePackFee = !order.packFeePaid && counts.unpaid > 0 ? Math.max(0, order.packFee || 0) : 0;
  const due = dueSubtotal + dueServiceCharge + duePackFee;
  return { subtotal, paid, dueSubtotal, dueServiceCharge, duePackFee, due, total: paid + due, servicePct, counts };
}

/**
 * Teng bo'lish: `total` ni `n` ulushga — butun so'mlarda, yig'indisi aniq `total`
 * (qoldiq so'mlar birinchi ulushlarga bittadan).
 */
export function splitEqually(total: number, n: number): number[] {
  const parts = Math.max(1, Math.floor(n));
  const sum = Math.max(0, Math.round(total));
  const base = Math.floor(sum / parts);
  let rest = sum - base * parts;
  return Array.from({ length: parts }, () => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return base + extra;
  });
}
