import type { IProduct, ProductStatus } from './models/tenant/Product';
import { isFractionalUnit, isValidQty, roundQty } from './qty';

/** Xizmat va to'plamning o'z qoldig'i yo'q (to'plam — tarkibidagi tovarlardan) */
export function isStockless(p: { kind?: string | null }): boolean {
  return p.kind === 'service' || p.kind === 'bundle';
}

/**
 * Ombordagi jismoniy qoldiq (hisobot, inventarizatsiya, ombor qiymati).
 * Xizmat/to'plam — 0: ularning o'z zaxirasi yo'q. Sotuv uchun mavjud son — lib/productKinds.ts → sellableInfo.
 */
export function getStockQty(p: Pick<IProduct, 'trackQuantity' | 'quantity' | 'soldQuantity' | 'status'> & { kind?: string | null }): number {
  if (isStockless(p)) return 0;
  if (p.trackQuantity) return Math.max(0, roundQty((p.quantity ?? 0) - (p.soldQuantity ?? 0)));
  return p.status === 'in_stock' ? 1 : 0;
}

export function getSoldQty(p: Pick<IProduct, 'trackQuantity' | 'quantity' | 'soldQuantity' | 'status'>): number {
  if (p.trackQuantity) return p.soldQuantity ?? 0;
  return p.status === 'sold' ? 1 : 0;
}

/**
 * Formadagi miqdor maydoni. Butun birlikda (dona, qop…) — pastga butunlanadi, 1 dan kichik → fallback.
 * Kasrli birlikda (kg, m…) — 3 xonaga yaxlitlanadi, 0 yoki manfiy → fallback.
 */
export function parseQtyField(v: string, fallback = 1, unit?: string | null): number {
  const n = Number(String(v).trim().replace(',', '.'));
  if (isFractionalUnit(unit)) {
    const r = Number.isFinite(n) ? roundQty(n) : 0;
    return r > 0 ? r : fallback;
  }
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

export function resolveStatusAfterSale(
  trackQuantity: boolean,
  quantity: number,
  soldQuantity: number,
): ProductStatus {
  if (!trackQuantity) return 'sold';
  return roundQty(soldQuantity - quantity) >= 0 ? 'sold' : 'in_stock';
}

type QtyProduct = Pick<IProduct, 'trackQuantity' | 'quantity' | 'soldQuantity' | 'status' | 'unit'> & { kind?: string | null };

export type SaleQtyCheck =
  | { ok: true; qty: number }
  | { ok: false; reason: 'badQty' }
  | { ok: false; reason: 'notEnough'; available: number };

/**
 * Sotuv miqdori: son yuritilmaydigan (IMEI) mahsulot — doim 1. Sanaladiganda miqdor birlikka mos
 * (dona — butun, kg — ≤3 xona kasr) va qoldiqdan oshmasligi shart. Qoldiqning yakuniy (atomik)
 * tekshiruvi baribir reserveStock'da. `undefined` — kiritilmagan (1), `null` — yaroqsiz kiritish.
 */
export function checkSaleQty(p: QtyProduct, requested: number | null | undefined): SaleQtyCheck {
  // Xizmat — istalgan miqdor (birlikka mos); to'plam — butun son, tarkib qoldig'ini reserveStock atomik tekshiradi
  if (isStockless(p)) {
    if (requested === null) return { ok: false, reason: 'badQty' };
    const qty = requested ?? 1;
    const unit = p.kind === 'bundle' ? 'dona' : p.unit;
    return isValidQty(qty, unit) ? { ok: true, qty: roundQty(qty) } : { ok: false, reason: 'badQty' };
  }
  if (!p.trackQuantity) return { ok: true, qty: 1 };
  if (requested === null) return { ok: false, reason: 'badQty' };
  const qty = requested ?? 1;
  if (!isValidQty(qty, p.unit)) return { ok: false, reason: 'badQty' };
  const available = getStockQty(p);
  if (qty > available) return { ok: false, reason: 'notEnough', available };
  return { ok: true, qty: roundQty(qty) };
}

export type ClampQtyResult = { ok: true; qty: number } | { ok: false; reason: 'noStock' | 'badQty' };

/**
 * Ko'chirish / ro'yxatdan tez sotuv: so'ralgan miqdor qoldiqdan oshsa — qoldiqqacha qisqaradi.
 * Qoldiq yo'q → noStock; miqdor birlikka mos emas yoki `null` (yaroqsiz kiritish) → badQty.
 */
export function clampQtyToStock(p: QtyProduct, requested: number | null | undefined): ClampQtyResult {
  // Xizmat/to'plamni ko'chirib bo'lmaydi (qoldig'i yo'q); ro'yxatdan tez sotuvda — 1 dona
  if (isStockless(p)) return { ok: false, reason: 'noStock' };
  if (!p.trackQuantity) return { ok: true, qty: 1 };
  const available = getStockQty(p);
  if (!(available > 0)) return { ok: false, reason: 'noStock' };
  if (requested === null) return { ok: false, reason: 'badQty' };
  const qty = requested ?? 1;
  if (!isValidQty(qty, p.unit)) return { ok: false, reason: 'badQty' };
  return { ok: true, qty: Math.min(roundQty(qty), available) };
}
