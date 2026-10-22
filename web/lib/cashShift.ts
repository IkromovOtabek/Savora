import { extractKassaPayments, isCashRow } from './kassa';
import type { ISale } from './models/tenant/Sale';
import type { ICashFlow } from './models/tenant/CashFlow';

export interface ShiftTotals {
  /** Smena davomida qo'lga olingan naqd (sotuv va to'lovlar) */
  cashIn: number;
  /** Mijozga naqd qaytarilgan pul */
  refunds: number;
  /** Kassadan olingan pul (filialga bog'langan chiqim / smena operatsiyasi) */
  withdrawals: number;
  /** Kassaga kiritilgan pul (filialga bog'langan kirim / smena operatsiyasi) */
  deposits: number;
  /** Hozir kassada bo'lishi kerak bo'lgan naqd */
  current: number;
  /** Karta/o'tkazma bilan tushgan pul (UzCard, HUMO, Click, Payme) — naqd kassaga kirmaydi */
  cardIn: number;
}

/**
 * Smena oralig'idagi naqd harakatlari. Naqd kassa sahifasidagi bilan bir xil qoida
 * (extractKassaPayments): naqd sotuv va bosh to'lovlar — tushum, qaytarish — chiqim.
 */
export function computeShiftTotals(
  sales: (ISale & { _id: unknown })[],
  cashFlows: Pick<ICashFlow, 'type' | 'amount' | 'createdAt'>[],
  openingCash: number,
  from: Date,
  to: Date,
): ShiftTotals {
  let cashIn = 0;
  let refunds = 0;
  let cardIn = 0;
  for (const row of extractKassaPayments(sales, from, to)) {
    if (row.method !== 'cash' && !row.isRefund) { cardIn += row.amount; continue; }
    if (!isCashRow(row)) continue;
    if (row.isRefund) refunds += -row.amount;
    else cashIn += row.amount;
  }
  let withdrawals = 0;
  let deposits = 0;
  for (const f of cashFlows) {
    const at = f.createdAt ? new Date(f.createdAt) : null;
    if (!at || at < from || at >= to) continue;
    if (f.type === 'expense') withdrawals += f.amount;
    else if (f.type === 'income') deposits += f.amount;
  }
  return { cashIn, refunds, withdrawals, deposits, current: openingCash + cashIn - refunds - withdrawals + deposits, cardIn };
}

/** Mongo duplicate key (11000) — shu filialda ochiq smena allaqachon bor */
export function isDuplicateKeyError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: number }).code === 11000;
}
