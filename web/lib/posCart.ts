/**
 * Kassa (POS) savatchasi hisob-kitobi — client va server bir xil ishlatadi (DB importi yo'q).
 * Savatchaning har bir qatori alohida naqd Sale bo'lib yoziladi; umumiy chegirma qatorlarga
 * summasiga mutanosib bo'linadi.
 */

export type DiscountKind = 'percent' | 'amount';
export interface CartDiscount { kind: DiscountKind; value: number }

/** Tayyor chegirma foizlari (BILLZ uslubi) */
export const DISCOUNT_PRESETS = [15, 30, 50, 75] as const;

/** Qatorning birlik narxi: ulgurji rejimda ulgurji narx (bo'lsa), aks holda sotuv narxi */
export function unitPriceFor(p: { salePrice: number; wholesalePrice?: number | null }, wholesale: boolean): number {
  return wholesale && p.wholesalePrice && p.wholesalePrice > 0 ? p.wholesalePrice : p.salePrice;
}

/** Chegirma summasi (butun so'm). Foiz 0–100 oralig'ida, summa oraliq jamidan oshmaydi. */
export function discountAmount(subtotal: number, d: CartDiscount | null | undefined): number {
  if (!d || !(d.value > 0) || subtotal <= 0) return 0;
  const raw = d.kind === 'percent' ? Math.round((subtotal * Math.min(d.value, 100)) / 100) : Math.round(d.value);
  return Math.max(0, Math.min(raw, subtotal));
}

/**
 * Chegirmani qatorlarga mutanosib taqsimlaydi: har qatorga pastga yaxlitlangan ulush,
 * qolgan so'mlar boshidan, sig'imi bor qatorlarga bittadan. Yig'indi = chegirma, hech bir
 * qator manfiy bo'lmaydi.
 */
export function allocateDiscount(lineTotals: number[], discount: number): number[] {
  const subtotal = lineTotals.reduce((s, n) => s + n, 0);
  const total = Math.max(0, Math.min(Math.round(discount), subtotal));
  if (total === 0 || subtotal === 0) return lineTotals.map(() => 0);
  const parts = lineTotals.map((n) => Math.floor((n * total) / subtotal));
  let rest = total - parts.reduce((s, n) => s + n, 0);
  for (let i = 0; rest > 0; i = (i + 1) % parts.length) {
    if (parts[i] < lineTotals[i]) { parts[i] += 1; rest -= 1; }
  }
  return parts;
}
