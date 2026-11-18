/**
 * Ishlab chiqarish UI umumiy yordamchilari (client va server bir xil ishlatadi — DB importi yo'q):
 * mahsulot tanlovi turi, birlik yorliqlari, miqdor kiritish, idempotentlik kaliti.
 */
import type { ProductUnit } from '@/lib/businessTypes';
import { fmtQty, isFractionalUnit, parseQty, roundQty } from '@/lib/qty';

/** Mahsulot tanlovi (GET /api/production/products → ProductOption) — UI'ga keragi */
export interface PickedProduct {
  id: string;
  code: string | null;
  name: string;
  unit: ProductUnit | null;
  purchaseUnit: ProductUnit | null;
  purchaseFactor: number | null;
  /** Tanlangan ombordagi qoldiq (asosiy birlikda); noma'lum — null */
  available: number | null;
}

export interface BranchOption {
  id: string;
  name: string;
  isMain: boolean;
}

type Units = Record<ProductUnit, string>;

/** Birlik nomi lug'atdan (birligi yo'q — «dona») */
export function unitName(unit: string | null | undefined, units: Units): string {
  return (unit && units[unit as ProductUnit]) || units.dona;
}

/** «1,5 kg» */
export function qtyText(n: number, unit: string | null | undefined, units: Units): string {
  return `${fmtQty(n)} ${unitName(unit, units)}`;
}

/** Miqdor maydoni uchun kiritishni tozalash: kasrli birlikda raqam va vergul/nuqta, aks holda faqat raqam */
export function cleanQtyInput(v: string, unit: string | null | undefined, opts: { fractional?: boolean } = {}): string {
  return opts.fractional || isFractionalUnit(unit) ? v.replace(/[^\d.,]/g, '') : v.replace(/\D/g, '');
}

/** Haqiqiy sarf: 0 ham mumkin (ishlatilmadi); aks holda birlik qoidasi bo'yicha. Yaroqsiz — null */
export function parseActualQty(v: string, unit: string | null | undefined): number | null {
  const s = v.trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  if (Number(s) === 0 && /^0*([.]0*)?$/.test(s)) return 0;
  return parseQty(s, unit);
}

/** Texkarta normasi: istalgan birlikda kasr (≤3 xona, > 0) */
export function parseNorm(v: string): number | null {
  return parseQty(v, 'kg');
}

/** Butun so'm (bo'shliqlarsiz raqam satri) → son; bo'sh — null */
export function parseSum(v: string): number | null {
  const s = v.replace(/\s/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/** Farq ko'rinishi: «+0,5» / «−1» / «0» */
export function signedQty(n: number): string {
  const r = roundQty(n);
  if (r === 0) return '0';
  return `${r > 0 ? '+' : '−'}${fmtQty(Math.abs(r))}`;
}

/** Idempotentlik kaliti (server: [A-Za-z0-9:_-], 8–64 belgi) */
export function newClientId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* xavfsiz bo'lmagan kontekst — pastdagi zaxira */
  }
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** 24 hex ObjectId satri */
export const isObjectId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
