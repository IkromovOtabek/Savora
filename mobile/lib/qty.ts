/**
 * Miqdor qoidalari — web/lib/qty.ts nusxasi (mobil web kodini import qila olmaydi; qoidalar bir xil
 * bo'lishi shart, server baribir qayta tekshiradi).
 *  - kg, g, m, m2, l — kasr miqdor, ko'pi bilan 3 xona (1,5 kg; 2,25 m)
 *  - dona/qop/quti/paket va birliksiz — butun son
 *  - narx × miqdor jami butun so'mga yaxlitlanadi
 */
const SCALE = 1000;
const QTY_MAX = 1_000_000;
const FRACTIONAL = ['kg', 'g', 'm', 'm2', 'l'];

export function isFractionalUnit(unit?: string | null): boolean {
  return !!unit && FRACTIONAL.includes(unit);
}

export function roundQty(n: number): number {
  return Math.round(n * SCALE) / SCALE;
}

export function qtyStep(unit?: string | null): number {
  return isFractionalUnit(unit) ? 1 / SCALE : 1;
}

/** "1,5" / "1.5" → 1.5; birlikka mos bo'lmasa (dona da kasr, 3 xonadan ko'p, ≤0) — null */
export function parseQty(v: string | number, unit?: string | null): number | null {
  const s = typeof v === 'number' ? String(v) : v.trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n > QTY_MAX) return null;
  if (!isFractionalUnit(unit)) return Number.isInteger(n) ? n : null;
  const r = roundQty(n);
  return Math.abs(r - n) < 1e-9 && r > 0 ? r : null;
}

export const addQty = (a: number, b: number): number => roundQty(a + b);

/** Narx × miqdor, butun so'mga (yarmi yuqoriga) — server bilan bir xil formula */
export function priceTimesQty(price: number, qty: number): number {
  const scaled = price * Math.round(qty * SCALE);
  if (!Number.isSafeInteger(scaled)) return Math.round(price * qty);
  return Math.floor((scaled + SCALE / 2) / SCALE);
}

/** 1.5 → "1,5"; 2 → "2" */
export function fmtQty(n: number): string {
  const r = roundQty(n);
  return Number.isInteger(r) ? String(r) : String(r).replace('.', ',');
}

/** Miqdor + lug'atdagi birlik: "1,5 kg", "3 dona" (units — d.productFields.units) */
export function qtyWithUnit(n: number, unit: string | null | undefined, units: Record<string, string>): string {
  return `${fmtQty(n)} ${(unit && units[unit]) || units.dona}`;
}
