import { calcSaleStatus } from './sales';
import { isValidQty, roundQty, subQty } from './qty';
import type { PaymentType } from './models/tenant/Sale';

/**
 * Qisman qaytarish hisobi (sof funksiya — DB'siz, testlanadi).
 *
 * Sotuvdan `returnQty` (dona yoki kasrli birlikda, masalan 0.5 kg) qaytsa:
 *  - qaytgan qiymat = jami × qaytgan / jami son (yaxlitlangan)
 *  - avval QARZ kamayadi (mijoz hali to'lamagan pul), qolgani mijozga NAQD qaytariladi
 *  - sotuv soni va summasi kamayadi — hisobotlar (foyda, kirim-chiqim) avtomatik to'g'ri chiqadi
 *
 * To'liq qaytarish (hamma dona) bu yerda emas — u "sotuvni bekor qilish" orqali.
 * Bank krediti sotuvida qisman qaytarish yo'q: pulni bank bergan, hisob-kitob bank bilan.
 */
export type ReturnCalcInput = {
  qty: number;
  /** Sotuvdagi o'lchov birligi: kg/m… — kasr qaytarish mumkin, dona/yo'q — butun */
  unit?: string | null;
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
  if (!isValidQty(returnQty, sale.unit)) return { ok: false, error: 'badQty' };
  if (roundQty(returnQty) >= roundQty(sale.qty)) return { ok: false, error: 'useCancel' };

  // Mutanosib summa butun arifmetikada (miqdorlar 0.001 birlikda) — float qoldig'isiz
  const amount = Math.round((sale.totalAmount * Math.round(returnQty * 1000)) / Math.round(sale.qty * 1000));
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
      newQty: subQty(sale.qty, returnQty),
      newTotal,
      newPaid,
      newRemaining,
      newStatus: newRemaining > 0 ? 'partial' : calcSaleStatus(newTotal, newPaid),
    },
  };
}
