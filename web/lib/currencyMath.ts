/** Valyuta hisoblari — sof funksiyalar (klient komponentlar ham ishlatadi, server modullarisiz) */

/** Dollar → so'm: 1000 so'mdan katta summalar 100 so'mgacha yaxlitlanadi */
export function usdToSom(usd: number, rate: number): number {
  const som = usd * rate;
  if (!Number.isFinite(som) || som <= 0) return 0;
  return som >= 1000 ? Math.round(som / 100) * 100 : Math.round(som);
}
