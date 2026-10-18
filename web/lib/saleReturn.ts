import { calcSaleStatus } from './sales';
import type { PaymentType } from './models/tenant/Sale';

/**
 * Qisman qaytarish hisobi (sof funksiya — DB'siz, testlanadi).
 *
 * Sotuvdan `returnQty` dona qaytsa:
 *  - qaytgan qiymat = jami × qaytgan / jami son (yaxlitlangan)
 *  - avval QARZ kamayadi (mijoz hali to'lamagan pul), qolgani mijozga NAQD qaytariladi
 *  - sotuv soni va summasi kamayadi — hisobotlar (foyda, kirim-chiqim) avtomatik to'g'ri chiqadi
 *
 * To'liq qaytarish (hamma dona) bu yerda emas — u "sotuvni bekor qilish" orqali.
 * Bank krediti sotuvida qisman qaytarish yo'q: pulni bank bergan, hisob-kitob bank bilan.
 */
export type ReturnCalcInput = {
  qty: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentType: PaymentType;
  status: string;
};

export type ReturnCalc = {
  amount: number;
  debtReduced: number;
  refundAmount: number;
  newQty: number;
  newTotal: number;
  newPaid: number;
  newRemaining: number;
  newStatus: 'paid' | 'partial';
};

export type ReturnCalcError = 'cancelled' | 'bankCredit' | 'badQty' | 'useCancel';

export function computePartialReturn(
  sale: ReturnCalcInput,
  returnQty: number,
): { ok: true; calc: ReturnCalc } | { ok: false; error: ReturnCalcError } {
  if (sale.status === 'cancelled') return { ok: false, error: 'cancelled' };
  if (sale.paymentType === 'bank_credit') return { ok: false, error: 'bankCredit' };
  if (!Number.isInteger(returnQty) || returnQty < 1) return { ok: false, error: 'badQty' };
  if (returnQty >= sale.qty) return { ok: false, error: 'useCancel' };

  const amount = Math.round((sale.totalAmount * returnQty) / sale.qty);
  const debtReduced = Math.min(amount, Math.max(0, sale.remainingAmount));
  const refundAmount = Math.min(amount - debtReduced, Math.max(0, sale.paidAmount));

  const newTotal = sale.totalAmount - amount;
  const newPaid = sale.paidAmount - refundAmount;
  const newRemaining = Math.max(0, sale.remainingAmount - debtReduced);

  return {
    ok: true,
    calc: {
      amount,
      debtReduced,
      refundAmount,
      newQty: sale.qty - returnQty,
      newTotal,
      newPaid,
      newRemaining,
      newStatus: newRemaining > 0 ? 'partial' : calcSaleStatus(newTotal, newPaid),
    },
  };
}
