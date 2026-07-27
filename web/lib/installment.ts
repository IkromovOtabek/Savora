import { ISale } from './models/tenant/Sale';

/** Oy holati: to'landi / qisman / muddati kelmagan / muddati o'tgan. */
export type InstallmentState = 'paid' | 'partial' | 'upcoming' | 'overdue';

/** Nasiya (variant) jadvalining bitta oyi. */
export interface InstallmentMonth {
  month: number; // 1-based
  amount: number; // shu oy uchun to'lanishi kerak bo'lgan summa
  paidAmount: number; // shu oyga to'langan qism (qisman to'lovlar ham hisobga olinadi)
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
>;

/**
 * Nasiya sotuvidan oylik to'lov jadvalini hisoblaydi.
 *
 * - Boshlang'ich = `downPayment` maydoni (yangi sotuvlar), bo'lmasa "Boshlang'ich to'lov"
 *   izohli to'lov, aks holda 0. MUHIM: `payments[0]` dan OLINMAYDI — chunki boshlang'ichsiz
 *   nasiyada birinchi oy to'lovi payments[0] bo'lib qolib, hisobni buzardi (eski bug).
 * - Oylik = (narx − boshlang'ich) / oylar; yaxlitlash qoldig'i oxirgi oyga qo'shiladi.
 * - Oy "to'langan" — boshlang'ichdan keyingi to'lovlar shu oygacha summani qoplasa
 *   (eng erta oylardan boshlab).
 * - Har oyning muddati = sotuv sanasi + N oy. Holat: paid / upcoming (muddat kelmagan) /
 *   overdue (muddat o'tgan, to'lanmagan).
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

  // Boshlang'ichdan keyin oylik to'lovlarga yo'nalgan summa
  let pool = Math.max(0, sale.paidAmount - down);
  const start = sale.createdAt ? new Date(sale.createdAt) : now;
  const nowT = now.getTime();

  const schedule: InstallmentMonth[] = [];
  for (let i = 1; i <= months; i++) {
    // Oxirgi oy yaxlitlash qoldig'ini oladi
    const amount = i < months ? baseMonthly : financed - baseMonthly * (months - 1);
    // Shu oyga to'langan qism — qisman to'lovlar ham hisobga olinadi
    const paidAmount = Math.min(pool, Math.max(0, amount));
    pool -= paidAmount;
    const paid = amount > 0 && paidAmount >= amount;

    const dueDate = new Date(start);
    dueDate.setMonth(dueDate.getMonth() + i);
    const overdue = dueDate.getTime() <= nowT;

    // Holat: to'liq → paid; qisman to'langan → partial; aks holda muddat bo'yicha
    const state: InstallmentState = paid
      ? 'paid'
      : paidAmount > 0
        ? 'partial'
        : overdue
          ? 'overdue'
          : 'upcoming';
    schedule.push({ month: i, amount, paidAmount, paid, dueDate, state });
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

/** Oy holati -> yorliq va rang klassi (UI uchun). */
export const INSTALLMENT_STATE_META: Record<InstallmentState, { label: string; cls: string }> = {
  paid: { label: 'To\'landi', cls: 'inst-state--paid' },
  partial: { label: 'Qisman', cls: 'inst-state--partial' },
  upcoming: { label: 'Muddat kelmagan', cls: 'inst-state--upcoming' },
  overdue: { label: 'To\'lanmagan', cls: 'inst-state--overdue' },
};
