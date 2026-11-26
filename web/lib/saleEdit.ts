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

/**
 * Tovarni almashtirish hisobi — sof funksiya (forma oldindan ko'rsatadi, yadro yozadi).
 * Yangi summa (yangi tovar narxi × miqdor) eski summaga solishtiriladi; to'langan pul va bank ulushi hisobga olinadi:
 *  - QIMMATROQ (delta > 0): `settle: 'now'` — farqni mijoz hozir to'laydi (to'lov yoziladi, kassaga tushadi);
 *    `'debt'` — farq qoldiqqa (qarz / nasiya oylariga). Sof bank kreditida qarz yo'q — faqat hozir.
 *  - ARZONROQ (delta < 0): avval mijoz qarzi kamayadi, ortig'i mijozga naqd qaytariladi. Sof bank kreditida
 *    qoldiq — bank ulushi, unga tegilmaydi: farq mijoz o'zi to'lagan puldan qaytariladi.
 *  - Bank ulushi o'zgarmaydi (shartnoma bank bilan): yangi summa bank ulushidan kam bo'lolmaydi.
 *  - Nasiya: mijoz qismi (summa − bank) boshlang'ich to'lovdan katta bo'lishi kerak. Hozir to'langan farq
 *    boshlang'ich to'lovga qo'shiladi (oylar o'zgarmaydi); qarzga qo'shilsa — to'lanmagan oylarga bo'linadi.
 */
export type SwapSettle = 'now' | 'debt';

export type SwapInput = {
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentType: PaymentType;
  status: string;
  /** Bank ulushlari jami (lib/bankCredit saleBankParts) — bankli bo'lmasa 0 */
  bank: number;
  /** Nasiya boshlang'ich to'lovi; boshqa turlarda 0 */
  downPayment?: number;
};

export type SwapCalc = {
  delta: number;
  newTotal: number;
  newPaid: number;
  newRemaining: number;
  newStatus: 'paid' | 'partial';
  /** Mijoz hozir to'laydigan (kassaga tushadigan) summa */
  collectNow: number;
  /** Qarzga (qoldiqqa) qo'shilgan summa */
  addedToDebt: number;
  /** Arzonlashganda qarzdan kamaygani */
  debtReduced: number;
  /** Arzonlashganda mijozga naqd qaytariladigani (kassadan chiqim) */
  refundAmount: number;
  /** Nasiya: yangi boshlang'ich to'lov (o'zgarmasa — undefined) */
  newDown?: number;
  /** Shu sotuvda farqni qarzga yozib bo'ladimi (sof bank kreditida — yo'q) */
  canDebt: boolean;
};

export type SwapError = 'cancelled' | 'badAmount' | 'belowBank' | 'belowDown';

export function computeProductSwap(
  sale: SwapInput,
  newTotal: number,
  settle: SwapSettle,
): { ok: true; calc: SwapCalc } | { ok: false; error: SwapError } {
  if (sale.status === 'cancelled') return { ok: false, error: 'cancelled' };
  if (!Number.isSafeInteger(newTotal) || newTotal < 1 || newTotal > MAX_SALE_TOTAL) return { ok: false, error: 'badAmount' };
  const bank = Math.max(0, sale.bank);
  const pureBank = sale.paymentType === 'bank_credit';
  if (newTotal < bank) return { ok: false, error: 'belowBank' };
  const down = sale.paymentType === 'installment' ? Math.max(0, sale.downPayment ?? 0) : 0;

  const paid = Math.max(0, sale.paidAmount);
  const remaining = Math.max(0, sale.remainingAmount);
  const delta = newTotal - sale.totalAmount;
  const canDebt = !pureBank;
  let newPaid = paid;
  let newRemaining = remaining;
  let collectNow = 0;
  let addedToDebt = 0;
  let debtReduced = 0;
  let refundAmount = 0;
  let newDown: number | undefined;

  if (delta > 0) {
    if (settle === 'now' || !canDebt) {
      collectNow = delta;
      newPaid = paid + delta;
      // Nasiya: hozirgi to'lov boshlang'ichga — oylik jadval (moliyalangan summa) o'zgarmaydi
      if (sale.paymentType === 'installment') newDown = down + delta;
    } else {
      addedToDebt = delta;
      newRemaining = remaining + delta;
    }
  } else if (delta < 0) {
    const cut = -delta;
    // Sof bank kreditida qoldiq — bank ulushi (Kredit kassa), mijoz qarzi emas
    debtReduced = pureBank ? 0 : Math.min(cut, remaining);
    refundAmount = cut - debtReduced;
    if (refundAmount > paid) return { ok: false, error: pureBank ? 'belowBank' : 'badAmount' };
    newPaid = paid - refundAmount;
    newRemaining = remaining - debtReduced;
  }

  if (sale.paymentType === 'installment' && newTotal - bank <= (newDown ?? down)) return { ok: false, error: 'belowDown' };

  return {
    ok: true,
    calc: {
      delta, newTotal, newPaid, newRemaining,
      newStatus: newRemaining > 0 || newPaid < newTotal ? 'partial' : 'paid',
      collectNow, addedToDebt, debtReduced, refundAmount, canDebt,
      ...(newDown !== undefined ? { newDown } : {}),
    },
  };
}
