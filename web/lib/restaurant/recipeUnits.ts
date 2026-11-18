/**
 * Retsept (taom texkartasi) — birlik va hisob yordamchilari. Client (muharrir) va server bir xil ishlatadi (DB yo'q).
 *
 * Retsept ombordagi xom ashyoning ASOSIY birligida saqlanadi (`Product.bundleItems[].qty`, masalan kg). Muharrirda
 * qulay birlik tanlanadi: xom ashyo kg bo'lsa — g yoki kg, l bo'lsa — ml yoki l, dona — dona. Kiritilgan son
 * `factor` ga ko'paytirib asosiy birlikka aylantiriladi (150 g → 0,15 kg). Aniqlik — lib/qty.ts (3 xona).
 */
import { isValidQty, priceTimesQty, roundQty } from '../qty';

/** Kiritish birligi: `unit` — ko'rinadigan kalit (g, kg, ml, l, dona yoki xom ashyoning o'z birligi) */
export interface RecipeUnit {
  unit: string;
  /** 1 kiritish birligi = factor asosiy birlik */
  factor: number;
}

/** Xom ashyo birligi uchun tanlanadigan birliklar (birinchisi — kichigi) */
export function recipeUnitsFor(base?: string | null): RecipeUnit[] {
  switch (base) {
    case 'kg': return [{ unit: 'g', factor: 0.001 }, { unit: 'kg', factor: 1 }];
    case 'g': return [{ unit: 'g', factor: 1 }, { unit: 'kg', factor: 1000 }];
    case 'l': return [{ unit: 'ml', factor: 0.001 }, { unit: 'l', factor: 1 }];
    case 't': return [{ unit: 'kg', factor: 0.001 }, { unit: 't', factor: 1 }];
    case undefined: case null: case '': case 'dona': return [{ unit: 'dona', factor: 1 }];
    default: return [{ unit: base, factor: 1 }];
  }
}

/** Saqlangan (asosiy birlikdagi) miqdor uchun qulay birlik: 1 kg dan kam — g, 1 l dan kam — ml */
export function preferredRecipeUnit(base: string | null | undefined, qty: number | null): RecipeUnit {
  const list = recipeUnitsFor(base);
  const main = list.find((u) => u.factor === 1) ?? list[0];
  if (list.length < 2) return main;
  const small = list[0];
  if (small.factor < 1 && (qty === null || qty < 1)) return small;
  return main;
}

/** Kiritilgan son → asosiy birlik (yaxlitlangan). Yaroqsiz yoki asosiy birlikka mos kelmasa — null */
export function toBaseQty(input: number, factor: number, base?: string | null): number | null {
  if (!Number.isFinite(input) || input <= 0 || !Number.isFinite(factor) || factor <= 0) return null;
  const raw = input * factor;
  // 3 xonadan nozik miqdor (0,5 g → 0,0005 kg) yaxlitlab yuborilmaydi — rad etiladi
  if (Math.abs(roundQty(raw) - raw) > 1e-9) return null;
  const q = roundQty(raw);
  return isValidQty(q, base) ? q : null;
}

/** Asosiy birlikdagi miqdor → tanlangan birlikda ko'rsatish uchun son */
export function fromBaseQty(qty: number, factor: number): number {
  return roundQty(qty / factor);
}

/** Retsept qatori tannarxi: kelish narxi (asosiy birlik uchun) × miqdor, butun so'm */
export function recipeLineCost(purchasePrice: number, qty: number): number {
  return priceTimesQty(Math.max(0, purchasePrice || 0), qty);
}

/** Sotuv narxiga nisbatan foyda foizi (marja): (narx − tannarx) / narx. Narx 0 bo'lsa — null */
export function marginPct(price: number, cost: number): number | null {
  if (!(price > 0)) return null;
  return Math.round(((price - cost) / price) * 1000) / 10;
}

/** Retsept bo'yicha necha porsiya tayyorlanadi: har xom ashyo qoldig'i / 1 porsiyadagi miqdori — eng kichigi */
export function portionsFrom(items: { qty: number; available: number }[]): number {
  if (!items.length) return 0;
  return Math.max(0, Math.min(...items.map((i) => (i.qty > 0 ? Math.floor(roundQty(i.available / i.qty)) : 0))));
}
