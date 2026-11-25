/**
 * Sotuvning to'lov shartlari — YAGONA qoida (web «Yangi sotuv», mobil API, keyin POS va boshqalar).
 * Sof funksiya (bazaga faqat `bankActive` orqali): xatolar kod bilan qaytadi, matnni chaqiruvchi o'z tilida chiqaradi
 * (`saleTermsErrorText`).
 *
 * Bank krediti + mijoz qismi (`nasiyaAmount`): muddat oyda — sotuv «Nasiya» (oylik jadval), kunda (`bankTermUnit: 'days'`,
 * `debtDays`) — «Qarz»; bank ulushlari `bankParts`da (Kredit kassa), qoldiq — faqat mijoz qismi.
 */
import type { PaymentType, ISaleBankPart } from '../models/tenant/Sale';
import type { Locale } from '../i18n/config';
import { MAX_BANK_DEBT_DAYS, MAX_BANK_PARTS, bankPartsTotal, parseBankPartsInput, validateBankParts, type BankPartsError } from '../bankCredit';
import { installmentDueDate, normPayDay } from '../installment';
import { pq294MonthsError } from '../pq294';
import type { Dict } from '../i18n/dict';
import { tr } from '../i18n/fmt';

/** Nasiya oylari chegarasi (kirish validatsiyasi ham shu) */
export const SALE_MAX_MONTHS = 60;

export interface SaleTermsInput {
  /** Foydalanuvchi tanlagan tur (bank + mijoz qismida — haqiqiy tur shu yerda aniqlanadi) */
  paymentType: PaymentType;
  total: number;
  /** Bosh to'lov (naqdda e'tiborga olinmaydi — to'liq to'langan) */
  paid?: number;
  /** Sotuvdagi tovar qatorlari soni (nasiya va bank + mijoz qismi — bitta tovar) */
  lineCount: number;
  months?: number;
  payDay?: unknown;
  /** Qarz muddati (kiritilgan sana) */
  dueDate?: Date;
  bankParts?: unknown;
  bankName?: string;
  nasiyaAmount?: number;
  bankTermUnit?: unknown;
  debtDays?: number;
  features: { nasiya?: boolean; variant?: boolean; creditKassa?: boolean };
  locale?: Locale;
  now?: Date;
}

export interface SaleTerms {
  paymentType: PaymentType;
  paid: number;
  bankParts?: ISaleBankPart[];
  /** Bank krediti + mijoz qismi (nasiya yoki qarz) */
  bankSplit: boolean;
  bankDebt: boolean;
  bankNasiya: boolean;
  months?: number;
  payDay?: number;
  /** Qoldiq bo'lsa amal qiladigan muddat (nasiyada — oxirgi oy) */
  dueDate?: Date;
}

export type SaleTermsError =
  | { code: 'installmentOneItem' | 'bankNasiyaOneItem' | 'paidExceeds' | 'nasiyaDisabled' | 'creditKassaDisabled' | 'bankRequired' | 'bankNotFound' | 'monthsRequired' }
  | { code: 'debtDaysRequired'; max: number }
  | { code: 'nasiyaPartTooBig'; rest: number }
  | { code: 'bankParts'; reason: BankPartsError; financed: number }
  | { code: 'pq294'; message: string };

/** Bank + mijoz qismi bo'lsa — mijoz qarzi (qoldiq); aks holda jami − to'langan */
export function saleRemaining(total: number, paid: number, terms: Pick<SaleTerms, 'bankSplit'>, lineBank?: ISaleBankPart[]): number {
  return Math.max(0, total - paid - (terms.bankSplit ? bankPartsTotal(lineBank) : 0));
}

export async function resolveSaleTerms(
  input: SaleTermsInput,
  /** Banklar faol va mavjudmi (Kredit kassa ro'yxati) */
  bankActive: (names: string[]) => Promise<boolean>,
): Promise<{ ok: true; terms: SaleTerms } | { ok: false; error: SaleTermsError }> {
  const now = input.now ?? new Date();
  const nasiyaPart = input.paymentType === 'bank_credit' ? Math.max(0, input.nasiyaAmount ?? 0) : 0;
  const bankSplit = nasiyaPart > 0;
  const bankDebt = bankSplit && input.bankTermUnit === 'days';
  const bankNasiya = bankSplit && !bankDebt;
  const paymentType: PaymentType = bankDebt ? 'debt' : bankNasiya ? 'installment' : input.paymentType;
  const multi = input.lineCount > 1;
  const { total } = input;

  // Nasiya — har tovar o'z oylik jadvali bilan; bank + qarz ham bitta tovar (bank ulushlari qatorlarga bo'linmaydi)
  if (paymentType === 'installment' && multi) return { ok: false, error: { code: bankNasiya ? 'bankNasiyaOneItem' : 'installmentOneItem' } };
  if (bankDebt && multi) return { ok: false, error: { code: 'bankNasiyaOneItem' } };
  const debtDays = input.debtDays;
  if (bankDebt && !(Number.isInteger(debtDays) && debtDays! >= 1 && debtDays! <= MAX_BANK_DEBT_DAYS)) {
    return { ok: false, error: { code: 'debtDaysRequired', max: MAX_BANK_DEBT_DAYS } };
  }

  const paid = paymentType === 'cash' ? total : Math.max(0, input.paid ?? 0);
  if (paid > total) return { ok: false, error: { code: 'paidExceeds' } };
  if (paymentType === 'installment' && !input.features.variant && !input.features.nasiya) return { ok: false, error: { code: 'nasiyaDisabled' } };
  if ((paymentType === 'bank_credit' || bankSplit) && !input.features.creditKassa) return { ok: false, error: { code: 'creditKassaDisabled' } };

  // Bank krediti: qolgan summa bir yoki bir nechta bankka (jami = jami − bosh to'lov − mijoz qismi; bankka kamida 1 so'm)
  let bankParts: ISaleBankPart[] | undefined;
  if (paymentType === 'bank_credit' || bankSplit) {
    const rest = total - paid;
    if (bankSplit && nasiyaPart >= rest) return { ok: false, error: { code: 'nasiyaPartTooBig', rest: Math.max(0, rest) } };
    const financed = rest - nasiyaPart;
    const raw = parseBankPartsInput(input.bankParts);
    if (raw === null) return { ok: false, error: { code: 'bankRequired' } };
    // Eski forma / bitta bank: faqat bankName — qolgan summa to'liq shu bankka
    const bankName = input.bankName?.trim();
    const v = validateBankParts(raw.length > 0 ? raw : bankName ? [{ bankName, amount: financed }] : [], financed);
    if (!v.ok) return { ok: false, error: { code: 'bankParts', reason: v.error, financed } };
    if (!(await bankActive(v.parts.map((p) => p.bankName)))) return { ok: false, error: { code: 'bankNotFound' } };
    bankParts = v.parts;
  }

  let months: number | undefined;
  let payDay: number | undefined;
  if (paymentType === 'installment') {
    payDay = normPayDay(input.payDay);
    const raw = Number(input.months);
    months = Number.isFinite(raw) && raw >= 1 ? Math.min(SALE_MAX_MONTHS, Math.floor(raw)) : undefined;
    if (!months) return { ok: false, error: { code: 'monthsRequired' } };
    const pq = pq294MonthsError(months, now, input.locale);
    if (pq) return { ok: false, error: { code: 'pq294', message: pq } };
  }

  // Muddat — faqat qoldiq bo'lsa: nasiyada oxirgi oy (to'lov kuni bo'yicha), bank + qarzda bugun + N kun, qarzda kiritilgan sana
  let dueDate: Date | undefined;
  if (total > paid && paymentType !== 'cash') {
    if (input.dueDate && !Number.isNaN(input.dueDate.getTime())) dueDate = input.dueDate;
    if (paymentType === 'installment' && months) dueDate = installmentDueDate(now, months, payDay);
    if (bankDebt && !dueDate) dueDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + debtDays!));
  }

  return { ok: true, terms: { paymentType, paid, bankParts, bankSplit, bankDebt, bankNasiya, months, payDay, dueDate } };
}

/** Xato matni (lug'atdan) */
export function saleTermsErrorText(e: SaleTermsError, d: Dict): string {
  const m = d.sales.actions;
  const sum = (n: number) => n.toLocaleString('uz-UZ');
  switch (e.code) {
    case 'debtDaysRequired': return tr(m.debtDaysRequired, { n: e.max });
    case 'nasiyaPartTooBig': return tr(m.nasiyaPartTooBig, { sum: sum(e.rest) });
    case 'pq294': return e.message;
    case 'bankParts':
      return {
        required: m.bankRequired,
        tooMany: tr(m.bankPartsTooMany, { n: MAX_BANK_PARTS }),
        duplicate: m.bankPartsDuplicate,
        badAmount: m.bankPartsBadAmount,
        nothingFinanced: m.bankNothingFinanced,
        sumMismatch: tr(m.bankPartsSum, { sum: sum(e.financed) }),
      }[e.reason];
    default: return m[e.code];
  }
}

/**
 * Narx huquqi (jami bo'yicha): ro'yxat narxidan arzon — `sale.discount`, qimmat — `sale.editPrice`.
 * Narxsiz tovar bo'lsa tekshirilmaydi (narx sotuvda kiritiladi). Qaytadi: yetmagan huquq yoki null.
 */
export async function missingPriceRight(
  listTotal: number,
  total: number,
  priced: boolean,
  can: (key: 'sale.discount' | 'sale.editPrice') => Promise<boolean>,
): Promise<'sale.discount' | 'sale.editPrice' | null> {
  if (!priced) return null;
  if (total < listTotal && !(await can('sale.discount'))) return 'sale.discount';
  if (total > listTotal && !(await can('sale.editPrice'))) return 'sale.editPrice';
  return null;
}
