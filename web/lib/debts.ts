import { ISale } from './models/tenant/Sale';
import { computeInstallmentPlan } from './installment';

export type DebtState = 'overdue' | 'due_soon' | 'on_track' | 'no_date';

export interface DebtInfo {
  state: DebtState;
  daysLeft: number | null;   // manfiy = kechikkan kun, musbat = qolgan kun
  /** Amaldagi muddat (nasiyada — birinchi to'lanmagan oy) */
  dueDate: Date | null;
  label: string;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Qarz uchun amaldagi muddat. Nasiya (oylik jadval) — birinchi to'lanmagan oyning muddati
 * (Nasiya sahifasi bilan bir xil); sotuvdagi `dueDate` nasiyada oxirgi oy, shuning uchun
 * o'tkazib yuborilgan oy «muddatida» ko'rinib qolardi. Oddiy qarz — `dueDate`.
 */
export function effectiveDueDate(sale: Pick<ISale, 'dueDate'> & Partial<ISale>, now = new Date()): Date | null {
  if ((sale.installmentMonths ?? 0) >= 1 && typeof sale.totalAmount === 'number' && typeof sale.paidAmount === 'number') {
    const plan = computeInstallmentPlan(sale as ISale, now);
    const next = plan?.schedule.find((m) => !m.paid);
    if (next) return next.dueDate;
  }
  return sale.dueDate ? new Date(sale.dueDate) : null;
}

/** Bir qarz sotuvining holatini hisoblaydi (nasiya — oylik jadval bo'yicha) */
export function computeDebtInfo(sale: Pick<ISale, 'dueDate'> & Partial<ISale>, now = new Date()): DebtInfo {
  const due = effectiveDueDate(sale, now);
  if (!due) {
    return { state: 'no_date', daysLeft: null, label: 'Muddat belgilanmagan', dueDate: null };
  }
  const days = Math.ceil((due.getTime() - new Date(now.toDateString()).getTime()) / DAY);

  if (days < 0) return { state: 'overdue', daysLeft: days, label: `${Math.abs(days)} kun kechikdi`, dueDate: due };
  if (days === 0) return { state: 'due_soon', daysLeft: 0, label: 'Bugun muddati', dueDate: due };
  if (days <= 7) return { state: 'due_soon', daysLeft: days, label: `${days} kun qoldi`, dueDate: due };
  return { state: 'on_track', daysLeft: days, label: `${days} kun qoldi`, dueDate: due };
}

/** Mijozga yuboriladigan eslatma matni (WhatsApp/Telegram uchun) */
export function buildReminderText(opts: {
  shopName: string;
  customerName?: string;
  productName: string;
  remaining: number;
  dueDate?: Date | string | null;
  overdue: boolean;
}): string {
  const { shopName, customerName, productName, remaining, dueDate, overdue } = opts;
  const sum = remaining.toLocaleString('uz-UZ');
  const due = dueDate ? new Date(dueDate).toLocaleDateString('uz-UZ') : null;
  const greet = customerName ? `Assalomu alaykum, ${customerName}!` : 'Assalomu alaykum!';
  const body = overdue
    ? `"${productName}" uchun to'lov muddati o'tib ketdi. Qoldiq qarz: ${sum} so'm.`
    : `"${productName}" uchun to'lov eslatmasi. Qoldiq qarz: ${sum} so'm${due ? `, muddat: ${due}` : ''}.`;
  return `${greet}\n\n${body}\n\nIltimos, to'lovni amalga oshirishingizni so'raymiz. Rahmat!\n— ${shopName}`;
}
