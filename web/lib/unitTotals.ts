/**
 * Miqdorni o'lchov birligi bo'yicha yig'ish — hisobot va dashboard yig'indilarida "12 dona"
 * bilan "3,5 kg" bitta songa qo'shilib ketmasin. Birligi yo'q (yoki noma'lum) — "dona".
 * Ko'rsatish: qtyByUnits (lib/i18n/fmt.ts).
 */
import { PRODUCT_UNITS, type ProductUnit } from './businessTypes';
import { roundQty } from './qty';

export type QtyByUnit = Partial<Record<ProductUnit, number>>;

export function unitKey(unit?: string | null): ProductUnit {
  return unit && (PRODUCT_UNITS as readonly string[]).includes(unit) ? (unit as ProductUnit) : 'dona';
}

/** `acc` ga qo'shadi (o'zini o'zgartiradi) va qaytaradi */
export function addQtyByUnit(acc: QtyByUnit, qty: number, unit?: string | null): QtyByUnit {
  const k = unitKey(unit);
  acc[k] = roundQty((acc[k] ?? 0) + qty);
  return acc;
}

export function mergeQtyByUnit(maps: readonly QtyByUnit[]): QtyByUnit {
  const out: QtyByUnit = {};
  for (const m of maps) for (const [u, n] of Object.entries(m)) addQtyByUnit(out, n ?? 0, u);
  return out;
}

/** Nolsiz yozuvlar, PRODUCT_UNITS tartibida (dona birinchi) */
export function qtyByUnitEntries(acc: QtyByUnit): [ProductUnit, number][] {
  return PRODUCT_UNITS.flatMap((u) => (acc[u] ? [[u, acc[u]] as [ProductUnit, number]] : []));
}

/** Bitta birlikdagi yig'indi bo'lsa — o'sha birlik, aralash yoki bo'sh bo'lsa — null */
export function singleUnit(acc: QtyByUnit): ProductUnit | null {
  const e = qtyByUnitEntries(acc);
  return e.length === 1 ? e[0][0] : null;
}
