/**
 * Miqdor qoidalari — kasrli o'lchov birliklari (kg, g, m, m2, l). Client va server bir xil
 * ishlatadi (DB importi yo'q); mobil nusxasi: mobile/lib/qty.ts.
 *
 *  - Kasrli birlikda miqdor > 0 va ko'pi bilan 3 xona (1 g / 1 ml / 1 mm aniqlik).
 *  - dona/qop/quti/paket va birligi yo'q mahsulot — butun son (≥ 1), avvalgidek.
 *  - Miqdor `Number` sifatida saqlanadi, lekin doim 3 xonaga yaxlitlanadi; Mongo'dagi atomik
 *    yangilashlar ham `$round` bilan (lib/stock.ts) — 0.1 + 0.2 kabi float qoldiqlari to'planmaydi.
 *  - Narx × miqdor jami butun so'mga yaxlitlanadi (narxlar butun so'm).
 */
import type { ProductUnit } from './businessTypes';

export const QTY_DECIMALS = 3;
const SCALE = 10 ** QTY_DECIMALS;
/** Bitta qatordagi eng katta miqdor (sotuv/ko'chirish validatsiyasi bilan bir xil) */
export const QTY_MAX = 1_000_000;

export const FRACTIONAL_UNITS: readonly ProductUnit[] = ['kg', 'g', 'm', 'm2', 'l'];

export function isFractionalUnit(unit?: string | null): boolean {
  return !!unit && (FRACTIONAL_UNITS as readonly string[]).includes(unit);
}

/** 3 xonaga yaxlitlash (float qoldig'ini tozalaydi: 3.3000000000000003 → 3.3) */
export function roundQty(n: number): number {
  return Math.round(n * SCALE) / SCALE;
}

/** Eng kichik ruxsat etilgan miqdor (input `min`/`step` uchun ham) */
export function qtyStep(unit?: string | null): number {
  return isFractionalUnit(unit) ? 1 / SCALE : 1;
}

/** Miqdor shu birlikda yaroqlimi: musbat, chegarada; kasrli birlikda ≤3 xona, aks holda butun */
export function isValidQty(n: number, unit?: string | null): boolean {
  if (!Number.isFinite(n) || n <= 0 || n > QTY_MAX) return false;
  if (!isFractionalUnit(unit)) return Number.isInteger(n);
  return Math.abs(roundQty(n) - n) < 1e-9 && roundQty(n) > 0;
}

/** Foydalanuvchi kiritgan matn/son → miqdor ("1,5" ham qabul qilinadi). Yaroqsiz — null. */
export function parseQty(v: unknown, unit?: string | null): number | null {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  const s = typeof v === 'number' ? v : v.trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  if (!isValidQty(n, unit)) return null;
  return isFractionalUnit(unit) ? roundQty(n) : n;
}

/** Ikki miqdor ayirmasi/yig'indisi — 3 xonaga yaxlitlangan */
export const subQty = (a: number, b: number): number => roundQty(a - b);
export const addQty = (a: number, b: number): number => roundQty(a + b);

/**
 * Qator jami: narx × miqdor, butun so'mga yaxlitlangan (yarmi yuqoriga). Butun arifmetikada
 * hisoblanadi — 1999 × 0.335 = 669.665 → 670 (float'da 669.66499… bo'lib 669 chiqardi).
 */
export function priceTimesQty(price: number, qty: number): number {
  const milli = Math.round(qty * SCALE);
  const scaled = price * milli;
  if (!Number.isSafeInteger(scaled)) return Math.round(price * qty);
  return Math.floor((scaled + SCALE / 2) / SCALE);
}

/** Miqdorni ko'rsatish: ortiqcha nollarsiz, o'nlik ajratuvchi vergul (1.5 → "1,5", 2 → "2") */
export function fmtQty(n: number): string {
  const r = roundQty(n);
  return Number.isInteger(r) ? String(r) : String(r).replace('.', ',');
}

/**
 * Tarix/audit yozuvlari uchun qisqa yorliq ("1,5 kg", "3 ta"). UI matnlarida esa lug'atdagi
 * birlik nomi ishlatiladi (d.stock.fields.units).
 */
export function qtyLabel(n: number, unit?: string | null): string {
  if (!unit || unit === 'dona') return `${fmtQty(n)} ta`;
  return `${fmtQty(n)} ${unit === 'm2' ? 'm²' : unit}`;
}
