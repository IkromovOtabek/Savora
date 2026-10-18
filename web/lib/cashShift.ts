import { extractKassaPayments } from './kassa';
import type { ISale } from './models/tenant/Sale';
import type { ICashFlow } from './models/tenant/CashFlow';

export interface ShiftTotals {
  /** Smena davomida qo'lga olingan naqd (sotuv va to'lovlar) */
  cashIn: number;
  /** Mijozga naqd qaytarilgan pul */
  refunds: number;
  /** Admin filial kassasidan olgan pul (Kirim-chiqim → chiqim) */
  withdrawals: number;
  /** Hozir kassada bo'lishi kerak bo'lgan naqd */
  current: number;
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
  for (const row of extractKassaPayments(sales, from, to)) {
    if (row.paymentType !== 'cash') continue;
    if (row.isRefund) refunds += -row.amount;
    else cashIn += row.amount;
  }
  let withdrawals = 0;
  for (const f of cashFlows) {
    const at = f.createdAt ? new Date(f.createdAt) : null;
    if (f.type === 'expense' && at && at >= from && at < to) withdrawals += f.amount;
  }
  return { cashIn, refunds, withdrawals, current: openingCash + cashIn - refunds - withdrawals };
}

/** Mongo duplicate key (11000) — shu filialda ochiq smena allaqachon bor */
export function isDuplicateKeyError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: number }).code === 11000;
}
