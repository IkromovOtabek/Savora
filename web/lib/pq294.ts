/**
 * PQ-294 (Prezident qarori, 14.08.2026) — 2027-yil 1-yanvardan muddatli to'lov (nasiya/BNPL)
 * xizmatlari uchun chegaralar. Manba: lex.uz/docs/-8407544, gazeta.uz (17.08.2026).
 *
 * Bu yordamchi tekshiruv — yuridik xulosa emas. BHM qiymati o'zgarganda BHM_SUM yangilanadi.
 * Landing, yordam markazi va (kelajakda) sotuv formasi shu yagona manbadan foydalanadi.
 */

export const PQ294_EFFECTIVE = '2027-01-01';

/** Maksimal muddat, oy */
export const PQ294_MAX_MONTHS = 12;
/** Maksimal xarid narxi — BHM soni */
export const PQ294_MAX_BHM = 250;
/** Asosiy qarzdan tashqari to'lovlar (ustama, komissiya, penya) — yillik chegara, % */
export const PQ294_MAX_EXTRA_PCT_YEAR = 50;
/** Do'kon operator talablariga tushishi mumkin bo'lgan chorak aylanmasi, so'm */
export const PQ294_QUARTER_TURNOVER = 500_000_000;
/** ...va nasiya savdosi ulushi, % */
export const PQ294_INSTALLMENT_SHARE_PCT = 50;

/**
 * Bazaviy hisoblash miqdori (BHM), so'm. 250 BHM ≈ 110 mln so'm (gazeta.uz, 01.09.2026 holatiga).
 * TODO(asoschi): rasmiy BHM qiymati o'zgarganda yangilang.
 */
export const BHM_SUM = 440_000;

export const PQ294_MAX_AMOUNT = PQ294_MAX_BHM * BHM_SUM;

export interface Pq294Input {
  /** Naqd (asosiy) narx, so'm */
  price: number;
  /** Nasiya jami narxi (naqd narx + ustama + komissiya), so'm */
  totalWithMarkup: number;
  /** Muddat, oy */
  months: number;
}

export type Pq294Issue = 'months' | 'amount' | 'extra';

export interface Pq294Result {
  ok: boolean;
  issues: Pq294Issue[];
  /** Qo'shimcha to'lov yillik hisobda, % (asosiy narxga nisbatan) */
  extraPctYear: number;
}

/**
 * Bitta nasiya shartlarini PQ-294 chegaralariga solishtiradi.
 * Qo'shimcha to'lov yillik foizi: (jami − narx) / narx × 12 / oylar × 100 (sodda, annuitetsiz baho).
 */
export function checkPq294({ price, totalWithMarkup, months }: Pq294Input): Pq294Result {
  const issues: Pq294Issue[] = [];
  const m = Math.max(1, Math.floor(months || 0));
  const p = Math.max(0, price || 0);
  const extra = Math.max(0, (totalWithMarkup || 0) - p);
  const extraPctYear = p > 0 ? Math.round(((extra / p) * (12 / m)) * 1000) / 10 : 0;

  if (m > PQ294_MAX_MONTHS) issues.push('months');
  if (p > PQ294_MAX_AMOUNT) issues.push('amount');
  if (extraPctYear > PQ294_MAX_EXTRA_PCT_YEAR) issues.push('extra');

  return { ok: issues.length === 0, issues, extraPctYear };
}

/** Do'kon operator talablariga tushishi mumkinmi (chorak bo'yicha) */
export function mayBeOperator(quarterTurnover: number, installmentTurnover: number): boolean {
  if (quarterTurnover <= PQ294_QUARTER_TURNOVER || quarterTurnover <= 0) return false;
  return (installmentTurnover / quarterTurnover) * 100 >= PQ294_INSTALLMENT_SHARE_PCT;
}
