import { ISale } from './models/tenant/Sale';

export type DebtState = 'overdue' | 'due_soon' | 'on_track' | 'no_date';

export interface DebtInfo {
  state: DebtState;
  daysLeft: number | null;   // manfiy = kechikkan kun, musbat = qolgan kun
  label: string;
}

const DAY = 24 * 60 * 60 * 1000;

/** Bir qarz sotuvining holatini hisoblaydi */
export function computeDebtInfo(sale: Pick<ISale, 'dueDate'>, now = new Date()): DebtInfo {
  if (!sale.dueDate) {
    return { state: 'no_date', daysLeft: null, label: 'Muddat belgilanmagan' };
  }
  const due = new Date(sale.dueDate);
  const days = Math.ceil((due.getTime() - new Date(now.toDateString()).getTime()) / DAY);

  if (days < 0) return { state: 'overdue', daysLeft: days, label: `${Math.abs(days)} kun kechikdi` };
  if (days === 0) return { state: 'due_soon', daysLeft: 0, label: 'Bugun muddati' };
  if (days <= 7) return { state: 'due_soon', daysLeft: days, label: `${days} kun qoldi` };
  return { state: 'on_track', daysLeft: days, label: `${days} kun qoldi` };
}

export const DEBT_STATE_META: Record<DebtState, { label: string; cls: string }> = {
  overdue: { label: 'Muddati o\'tgan', cls: 'badge-status--expired' },
  due_soon: { label: 'Muddati yaqin', cls: 'badge-status--suspended' },
  on_track: { label: 'Muddatida', cls: 'badge-status--active' },
  no_date: { label: 'Muddatsiz', cls: 'badge-status--suspended' },
};

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
