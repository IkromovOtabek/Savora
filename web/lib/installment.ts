import { ISale } from './models/tenant/Sale';
import { addMonthsClamped } from './dates';

/** Oy holati: to'landi / qisman / muddati kelmagan / muddati o'tgan. */
export type InstallmentState = 'paid' | 'partial' | 'upcoming' | 'overdue';

/** Nasiya (variant) jadvalining bitta oyi. */
export interface InstallmentMonth {
  month: number; // 1-based
  amount: number; // shu oy uchun to'lanishi kerak bo'lgan summa (qisman to'lovdan keyin bo'linsa — yangisi)
  planned: number; // dastlabki reja (teng bo'lingan) — farq: qoldiq shu oydan ketgan/shu oyga qo'shilgan
  paidAmount: number; // shu oyga to'langan qism (qisman to'lovlar ham hisobga olinadi)
  left: number; // shu oydan hali to'lanmagan qism = amount − paidAmount (qisman to'lovda kamayadi)
  paid: boolean; // to'liq to'langanmi
  dueDate: Date; // shu oy to'lovi qachon bo'lishi kerak
  state: InstallmentState;
}

/** Nasiya to'lov rejasi — sotuv ma'lumotidan hisoblanadi. */
export interface InstallmentPlan {
  total: number; // sotilgan narx
  down: number; // boshlang'ich to'lov
  monthly: number; // asosiy oylik to'lov (yaxlitlangan)
  months: number; // oylar soni
  monthsPaid: number; // to'langan oylar soni
  paid: number; // jami to'langan
  remaining: number; // qoldiq
  overdueCount: number; // muddati o'tgan, to'lanmagan oylar soni
  schedule: InstallmentMonth[];
}

const DOWN_NOTE = 'Boshlang\'ich to\'lov';

type SaleForPlan = Pick<
  ISale,
  'totalAmount' | 'paidAmount' | 'remainingAmount' | 'installmentMonths' | 'payments' | 'downPayment' | 'createdAt'
  | 'payDay' | 'installmentAmounts'
>;

/** To'lov kuni (1–31) — noto'g'ri qiymat bo'lsa yo'q */
export function normPayDay(v: unknown): number | undefined {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 31 ? n : undefined;
}

/**
 * N-oy to'lov sanasi. To'lov kuni tanlangan bo'lsa — sotuvdan keyingi N-oyning shu kuni
 * (qisqa oyda — oy oxiri), kun oxirigacha muddat (shu kuni to'lasa — kechikkan emas).
 * Tanlanmagan (eski sotuv) — sotuv sanasi + N oy.
 */
export function installmentDueDate(start: Date, month: number, payDay?: number | null): Date {
  const day = normPayDay(payDay);
  if (!day) return addMonthsClamped(start, month);
  const y = start.getFullYear();
  const m = start.getMonth() + month;
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(day, last), 23, 59, 59, 999);
}

/** Teng bo'lingan reja: oylik = moliyalashtirilgan / oylar, yaxlitlash qoldig'i oxirgi oyga */
function plannedAmounts(financed: number, months: number): number[] {
  const base = Math.floor(financed / months);
  return Array.from({ length: months }, (_, i) => (i < months - 1 ? base : financed - base * (months - 1)));
}

/**
 * Oy summalari: saqlangan (qisman to'lovdan keyin bo'lingan) yoki teng reja.
 * Saqlangan jami moliyalashtirilgan summadan farq qilsa (qisman qaytarish qarzni kamaytirgan) —
 * farq oxirgi oylardan ayiriladi / oxirgi oyga qo'shiladi.
 */
function monthAmounts(sale: SaleForPlan, financed: number, months: number, planned: number[]): number[] {
  const stored = sale.installmentAmounts;
  if (!Array.isArray(stored) || stored.length !== months || stored.some((x) => !Number.isFinite(x) || x < 0)) return planned;
  const amounts = stored.map((x) => Math.round(x));
  let delta = financed - amounts.reduce((a, x) => a + x, 0);
  if (delta > 0) amounts[months - 1] += delta;
  for (let i = months - 1; i >= 0 && delta < 0; i--) {
    const cut = Math.min(amounts[i], -delta);
    amounts[i] -= cut;
    delta += cut;
  }
  return amounts;
}

/**
 * Nasiya sotuvidan oylik to'lov jadvalini hisoblaydi.
 *
 * - Boshlang'ich = `downPayment` maydoni (yangi sotuvlar), bo'lmasa "Boshlang'ich to'lov"
 *   izohli to'lov, aks holda 0. MUHIM: `payments[0]` dan OLINMAYDI — chunki boshlang'ichsiz
 *   nasiyada birinchi oy to'lovi payments[0] bo'lib qolib, hisobni buzardi (eski bug).
 * - Oylik = (narx − boshlang'ich) / oylar; yaxlitlash qoldig'i oxirgi oyga qo'shiladi.
 *   Qisman to'lovda qoldiq keyingi oylarga bo'lingan bo'lsa — `installmentAmounts` dan.
 * - Oy "to'langan" — boshlang'ichdan keyingi to'lovlar shu oygacha summani qoplasa
 *   (eng erta oylardan boshlab).
 * - Har oyning muddati — `installmentDueDate` (to'lov kuni yoki sotuv sanasi + N oy).
 *   Holat: paid / upcoming (muddat kelmagan) / overdue (muddat o'tgan, to'lanmagan).
 */
export function computeInstallmentPlan(sale: SaleForPlan, now: Date = new Date()): InstallmentPlan | null {
  const months = sale.installmentMonths ?? 0;
  if (months < 1) return null;

  const total = Math.max(0, sale.totalAmount);
  const down = typeof sale.downPayment === 'number'
    ? Math.max(0, sale.downPayment)
    : Math.max(0, sale.payments?.find((p) => p.note === DOWN_NOTE)?.amount ?? 0);
  const financed = Math.max(0, total - down);
  const baseMonthly = Math.floor(financed / months);
  const planned = plannedAmounts(financed, months);
  const amounts = monthAmounts(sale, financed, months, planned);

  // Boshlang'ichdan keyin oylik to'lovlarga yo'nalgan summa
  let pool = Math.max(0, sale.paidAmount - down);
  const start = sale.createdAt ? new Date(sale.createdAt) : now;
  const nowT = now.getTime();

  const schedule: InstallmentMonth[] = [];
  for (let i = 1; i <= months; i++) {
    const amount = amounts[i - 1];
    // Shu oyga to'langan qism — qisman to'lovlar ham hisobga olinadi
    const paidAmount = Math.min(pool, Math.max(0, amount));
    pool -= paidAmount;
    const paid = amount > 0 && paidAmount >= amount;

    // 31-yanvar + 1 oy → fevral oxiri (setMonth kabi 3-martga "sakrab" ketmaydi)
    const dueDate = installmentDueDate(start, i, sale.payDay);
    const overdue = dueDate.getTime() <= nowT;

    // Holat: to'liq → paid; qisman to'langan → partial; aks holda muddat bo'yicha
    const state: InstallmentState = paid
      ? 'paid'
      : paidAmount > 0
        ? 'partial'
        : overdue
          ? 'overdue'
          : 'upcoming';
    schedule.push({ month: i, amount, planned: planned[i - 1], paidAmount, left: Math.max(0, amount - paidAmount), paid, dueDate, state });
  }

  return {
    total,
    down,
    monthly: baseMonthly,
    months,
    monthsPaid: schedule.filter((s) => s.paid).length,
    paid: sale.paidAmount,
    remaining: sale.remainingAmount,
    // Muddati o'tgan va to'liq to'lanmagan oylar (qisman to'langanlar ham) — eslatma/banner uchun
    overdueCount: schedule.filter((s) => !s.paid && s.dueDate.getTime() <= nowT).length,
    schedule,
  };
}

/** N-oygacha (shu oy ham) to'lanmagan summa — "N-oygacha to'lash" tugmasi uchun. */
export function leftUpToMonth(schedule: InstallmentMonth[], month: number): number {
  return schedule.reduce((a, m) => (m.month <= month ? a + m.left : a), 0);
}

/** To'lov qaysi oylarga tushadi (eng erta to'lanmagan oydan): oxirgisi to'liq yopiladimi */
export function installmentPaymentMonths(
  schedule: InstallmentMonth[],
  amount: number,
): { from: number; to: number; partialLast: boolean } | undefined {
  let pool = amount;
  let first = 0;
  let last = 0;
  let lastFull = true;
  for (const m of schedule) {
    if (pool <= 0) break;
    if (m.left <= 0) continue;
    const part = Math.min(pool, m.left);
    pool -= part;
    if (!first) first = m.month;
    last = m.month;
    lastFull = part >= m.left;
  }
  return first ? { from: first, to: last, partialLast: !lastFull } : undefined;
}

/** Qisman to'lovda yetmagan summani keyingi oylarga bo'lish natijasi */
export interface ShortfallSpread {
  /** Yangi oy summalari (Sale.installmentAmounts) */
  amounts: number[];
  /** Yopilgan (qisman to'langan) oy */
  month: number;
  /** Keyingi oylarga o'tgan summa */
  carry: number;
  from: number;
  to: number;
  /** Har oyga qo'shiladigan (oxirgisiga yaxlitlash qoldig'i ham) */
  perMonth: number;
}

/**
 * Qisman to'lov: to'lov navbatdagi (eng erta to'lanmagan) oyning qolgan qismidan kam bo'lsa — shu oy
 * to'langan summa bilan yopiladi, yetmagani keyingi oylarga teng bo'linadi (qoldiq oxirgi oyga).
 * Masalan: oylik 1 000 000, to'lov 800 000, yana 11 oy → 200 000 / 11 = har oyga +18 181 (oxirgisiga +18 191).
 * null — bo'lish shart emas yoki mumkin emas (to'liq to'lov, oxirgi oy).
 */
export function spreadShortfall(schedule: InstallmentMonth[], amount: number): ShortfallSpread | null {
  const next = schedule.find((m) => !m.paid && m.left > 0);
  if (!next || !(amount > 0) || amount >= next.left) return null;
  const later = schedule.filter((m) => m.month > next.month);
  if (later.length === 0) return null;
  const carry = next.left - amount;
  const perMonth = Math.floor(carry / later.length);
  const amounts = schedule.map((m) => m.amount);
  amounts[next.month - 1] = next.paidAmount + amount;
  later.forEach((m, j) => {
    amounts[m.month - 1] += perMonth + (j === later.length - 1 ? carry - perMonth * later.length : 0);
  });
  return { amounts, month: next.month, carry, from: later[0].month, to: later[later.length - 1].month, perMonth };
}

/**
 * To'lov qaysi oylarga tushishini izohlaydi. To'lov doim eng erta to'lanmagan oydan
 * boshlab yopiladi (computeInstallmentPlan bilan bir xil tartib), shuning uchun izoh
 * foydalanuvchi bosgan oydan emas — haqiqiy taqsimotdan yasaladi:
 * "2-oy to'lovi", "2-oy (qisman)", "2–3-oy to'lovi", "2–4-oy (4-oy qisman)".
 * Izoh DB'da o'zbekcha saqlanadi (boshqa avtomatik izohlar kabi).
 */
export function installmentPaymentNote(schedule: InstallmentMonth[], amount: number, spread?: ShortfallSpread | null): string | undefined {
  const r = installmentPaymentMonths(schedule, amount);
  if (!r) return undefined;
  const { from: first, to: last } = r;
  const lastFull = !r.partialLast;
  const base = first === last
    ? (lastFull ? `${first}-oy to'lovi` : `${first}-oy (qisman)`)
    : (lastFull ? `${first}–${last}-oy to'lovi` : `${first}–${last}-oy (${last}-oy qisman)`);
  if (!spread) return base;
  const target = spread.from === spread.to ? `${spread.from}-oyga o'tkazildi` : `${spread.from}–${spread.to}-oylarga bo'lindi`;
  return `${base} · ${spread.carry.toLocaleString('uz-UZ')} so'm ${target}`;
}

/** Oy holati -> yorliq va rang klassi (UI uchun). */
export const INSTALLMENT_STATE_META: Record<InstallmentState, { label: string; cls: string }> = {
  paid: { label: 'To\'landi', cls: 'inst-state--paid' },
  partial: { label: 'Qisman', cls: 'inst-state--partial' },
  upcoming: { label: 'Muddat kelmagan', cls: 'inst-state--upcoming' },
  overdue: { label: 'To\'lanmagan', cls: 'inst-state--overdue' },
};
