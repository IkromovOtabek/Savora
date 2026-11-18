/**
 * Kirim akti va xarid buyurtmasi qatorlari — client tomondagi umumiy holat va hisob (DB importi yo'q).
 * Birlik: asosiy (`unit`) yoki xarid birligi (`purchaseUnit`, 1 xarid birligi = `purchaseFactor` asosiy) —
 * lib/production/calc.ts → lineQty/unitFactor bilan serverdagi tekshiruv bir xil.
 */
import type { ProductUnit } from '@/lib/businessTypes';
import { lineQty, unitFactor } from '@/lib/production/calc';
import { parseQty, priceTimesQty } from '@/lib/qty';

/** Qatordagi tovar (GET /api/production/products → ProductOption'ning kerakli qismi) */
export interface LineProduct {
  id: string;
  code: string | null;
  name: string;
  unit: ProductUnit | null;
  purchaseUnit: ProductUnit | null;
  purchaseFactor: number | null;
  /** Shu ombordagi qoldiq (asosiy birlikda); noma'lum — null */
  available: number | null;
  barcode: string | null;
  /** O'rtacha kelish narxi (asosiy birlik uchun); huquq bo'lmasa — null */
  cost: number | null;
}

export interface DocLine {
  /** React kaliti (server qatori id'si yoki yangi qator uchun tasodifiy) */
  key: string;
  product: LineProduct;
  /** Kiritilgan matn («1,5») */
  qty: string;
  unit: ProductUnit;
  /** Narx — faqat raqamlar ('' — kiritilmagan) */
  price: string;
  /** Server: narx kiritilganmi (narx yashirin foydalanuvchi uchun) */
  priced: boolean;
  /** YYYY-MM-DD yoki '' */
  expiry: string;
  poLineId: string | null;
}

export const baseUnitOf = (p: Pick<LineProduct, 'unit'>): ProductUnit => p.unit ?? 'dona';

/** Qatorda tanlanadigan birliklar: asosiy + (bo'lsa) xarid birligi */
export function unitChoices(p: LineProduct): ProductUnit[] {
  const base = baseUnitOf(p);
  return p.purchaseUnit && p.purchaseUnit !== base && p.purchaseFactor && p.purchaseFactor > 0 ? [base, p.purchaseUnit] : [base];
}

/** Kiritilgan miqdor (yaroqsiz — null): birlik mahsulotga mos, asosiy birlikdagi natija ham yaroqli */
export function lineQtyOf(l: Pick<DocLine, 'qty' | 'unit' | 'product'>): { qty: number; baseQty: number; factor: number } | null {
  const q = parseQty(l.qty, l.unit);
  if (q === null) return null;
  const r = lineQty(l.product, q, l.unit);
  return r.ok ? { qty: q, baseQty: r.baseQty, factor: r.factor } : null;
}

export const factorOf = (l: Pick<DocLine, 'unit' | 'product'>): number => unitFactor(l.product, l.unit) ?? 1;

/** Qator summasi (narx kiritilmagan yoki miqdor yaroqsiz — null) */
export function lineAmountOf(l: DocLine): number | null {
  if (l.price === '') return null;
  const q = lineQtyOf(l);
  return q ? priceTimesQty(Number(l.price), q.qty) : null;
}

export const sumAmounts = (lines: readonly DocLine[]): number => lines.reduce((s, l) => s + (lineAmountOf(l) ?? 0), 0);

/** Idempotentlik kaliti (serverda [A-Za-z0-9:_-], 8–64) */
export function newClientId(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

let seq = 0;
export const newKey = (): string => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

/** ISO → YYYY-MM-DD (sana UTC yarim tunida saqlanadi) */
export const toDateInput = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : '');

/** YYYY-MM-DD → Date (UTC yarim tun) yoki undefined */
export const fromDateInput = (v: string): Date | undefined => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : undefined);

/**
 * Yangi qator: xarid birligi bo'lsa — standart shu (tovar qop bilan keladi), aks holda asosiy.
 * `withPrice` — narx oxirgi o'rtacha kelish narxidan (shu birlik uchun) oldindan to'ldiriladi.
 */
export function lineFromProduct(p: LineProduct, opts: { qty?: string; withPrice?: boolean } = {}): DocLine {
  const units = unitChoices(p);
  const unit = units[units.length - 1];
  const factor = unitFactor(p, unit) ?? 1;
  const price = opts.withPrice && p.cost && p.cost > 0 ? String(Math.round(p.cost * factor)) : '';
  return { key: newKey(), product: p, qty: opts.qty ?? '1', unit, price, priced: false, expiry: '', poLineId: null };
}

/** API javobi (ProductOption) → qator tovari */
export function toLineProduct(o: {
  id: string; code: string | null; name: string; unit: ProductUnit | null; purchaseUnit: ProductUnit | null;
  purchaseFactor: number | null; available?: number | null; barcode?: string | null; cost?: number | null;
}): LineProduct {
  return {
    id: o.id, code: o.code, name: o.name, unit: o.unit, purchaseUnit: o.purchaseUnit, purchaseFactor: o.purchaseFactor,
    available: o.available ?? null, barcode: o.barcode ?? null, cost: o.cost ?? null,
  };
}
