import type { PaymentType } from './models/tenant/Sale';

/**
 * Sotuv narxini (jami summa) tahrirlash hisobi — sof funksiya (DB'siz, testlanadi; client'da ham — oldindan ko'rish).
 *
 * Qoida («Qaytarish» bilan bir xil):
 *  - narx OSHSA — farq qoldiqqa (qarzga) qo'shiladi; naqd sotuv ham qoldiqli bo'ladi, farq keyin
 *    «To'lov qabul qilish» orqali kiritiladi (kassaga o'z kunida, o'z usuli bilan tushadi)
 *  - narx KAMAYSA — avval qoldiq (qarz) kamayadi, ortig'i mijozga NAQD qaytariladi
 *    (sotuvning `returns` ro'yxatiga `kind: 'price'` yozuvi — kassa, kirim-chiqim, foyda uni qaytarish kabi hisoblaydi)
 *  - bank krediti (va bank + nasiya/qarz) — narx o'zgarmaydi: bank ulushi qat'iy, hisob-kitob bank bilan
 *  - nasiya — narx boshlang'ich to'lovdan katta bo'lishi kerak; oylar `respreadInstallmentAmounts` bilan
 */
export type PriceEditInput = {
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentType: PaymentType;
  status: string;
  bankParts?: { amount: number }[] | null;
  /** Nasiya boshlang'ich to'lovi (lib/installment hisoblagani); boshqa turlarda 0 */
  downPayment?: number;
};

export type PriceEditCalc = {
  /** Yangi − eski narx (manfiy — arzonlashdi) */
  delta: number;
  /** Narx kamayganda qarzdan kamaygani */
  debtReduced: number;
  /** Narx kamayganda mijozga naqd qaytarilgani (kassadan chiqim) */
  refundAmount: number;
  newTotal: number;
  newPaid: number;
  newRemaining: number;
  newStatus: 'paid' | 'partial';
};

export type PriceEditError = 'cancelled' | 'bankCredit' | 'badAmount' | 'same' | 'belowDown';

/** Narxning yuqori chegarasi — 100 mlrd so'm (xato kiritishdan himoya) */
export const MAX_SALE_TOTAL = 100_000_000_000;

export function computePriceEdit(
  sale: PriceEditInput,
  newTotal: number,
): { ok: true; calc: PriceEditCalc } | { ok: false; error: PriceEditError } {
  if (sale.status === 'cancelled') return { ok: false, error: 'cancelled' };
  if (sale.paymentType === 'bank_credit' || (sale.bankParts?.length ?? 0) > 0) return { ok: false, error: 'bankCredit' };
  if (!Number.isSafeInteger(newTotal) || newTotal < 1 || newTotal > MAX_SALE_TOTAL) return { ok: false, error: 'badAmount' };
  if (newTotal === sale.totalAmount) return { ok: false, error: 'same' };
  if (sale.paymentType === 'installment' && newTotal <= Math.max(0, sale.downPayment ?? 0)) return { ok: false, error: 'belowDown' };

  const paid = Math.max(0, sale.paidAmount);
  const remaining = Math.max(0, sale.remainingAmount);
  const delta = newTotal - sale.totalAmount;

  if (delta > 0) {
    return {
      ok: true,
      calc: { delta, debtReduced: 0, refundAmount: 0, newTotal, newPaid: paid, newRemaining: remaining + delta, newStatus: 'partial' },
    };
  }

  const cut = -delta;
  const debtReduced = Math.min(cut, remaining);
  const refundAmount = Math.min(cut - debtReduced, paid);
  const newPaid = paid - refundAmount;
  const newRemaining = remaining - debtReduced;
  return {
    ok: true,
    calc: {
      delta, debtReduced, refundAmount, newTotal, newPaid, newRemaining,
      newStatus: newRemaining > 0 || newPaid < newTotal ? 'partial' : 'paid',
    },
  };
}

/**
 * Nasiya narxi o'zgarganda oylar summasi: to'liq to'langan oylar O'ZGARMAYDI, qolgan summa
 * to'lanmagan oylarga teng bo'linadi (yaxlitlash qoldig'i — oxirgisiga). Hamma oy to'langan bo'lsa —
 * farq oxirgi oyga tushadi. Har oyga kamida 1 so'm tushmasa — null (jadval teng bo'linadi).
 */
export function respreadInstallmentAmounts(
  schedule: readonly { amount: number; paid: boolean }[],
  newFinanced: number,
): number[] | null {
  const n = schedule.length;
  if (n === 0 || !Number.isSafeInteger(newFinanced)) return null;
  let open = schedule.flatMap((m, i) => (m.paid ? [] : [i]));
  if (open.length === 0) open = [n - 1];
  const openSet = new Set(open);
  const fixed = schedule.reduce((a, m, i) => (openSet.has(i) ? a : a + m.amount), 0);
  const rest = newFinanced - fixed;
  if (rest < open.length) return null;
  const base = Math.floor(rest / open.length);
  const amounts = schedule.map((m) => m.amount);
  open.forEach((i, k) => { amounts[i] = k === open.length - 1 ? rest - base * (open.length - 1) : base; });
  return amounts;
}
