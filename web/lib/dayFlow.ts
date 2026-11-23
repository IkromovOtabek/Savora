/**
 * Kunlik kirim-chiqim (Kassa → «Kirim-chiqim», mobil «Kunlik kirim-chiqim») — Realizatsiya bilan bir manba
 * (`loadRealization`): sotuv va qarz/nasiya to'lovlari, bank tushumi, Moliya kirim/xarajatlari, qaytarishlar,
 * yetkazib beruvchiga to'lovlar. Bu yerda — filial bo'yicha cheklash va tur bo'yicha jamlash (sof funksiyalar).
 */
import type { MoneyKind, MoneyRow } from './realization';

/** Kirim turlari va chiqim turlari — ekranda shu tartibda */
export const IN_KINDS = ['salePay', 'debtPay', 'bank', 'income'] as const satisfies readonly MoneyKind[];
export const OUT_KINDS = ['expense', 'refund', 'supplier'] as const satisfies readonly MoneyKind[];

/**
 * Filial login — faqat o'z filiali qatorlari. Filialsiz Moliya yozuvlari va yetkazib beruvchiga to'lovlar
 * butun biznesniki (egasi ko'radi), filial kassasiga tegishli emas.
 */
export function scopeMoneyRows(rows: MoneyRow[], branchId: string | null | undefined): MoneyRow[] {
  return branchId ? rows.filter((r) => r.branchId === branchId) : rows;
}

/** Tur bo'yicha jami (kirim turlarida — kirim, chiqim turlarida — chiqim summasi) */
export function sumByKind(rows: MoneyRow[]): Record<MoneyKind, number> {
  const out: Record<MoneyKind, number> = { salePay: 0, debtPay: 0, bank: 0, income: 0, expense: 0, refund: 0, supplier: 0 };
  for (const r of rows) out[r.kind] += r.amountIn + r.amountOut;
  return out;
}
