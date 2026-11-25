import { describe, expect, it } from 'vitest';
import { computeDebtInfo } from '@/lib/debts';
import type { ISale } from '@/lib/models/tenant/Sale';

const NOW = new Date('2026-06-15T12:00:00');

describe('computeDebtInfo', () => {
  it('oddiy qarz — sotuvdagi dueDate bo\'yicha', () => {
    const info = computeDebtInfo({ dueDate: new Date('2026-06-10T00:00:00') }, NOW);
    expect(info.state).toBe('overdue');
    expect(info.daysLeft).toBe(-5);
  });

  it('muddatsiz qarz', () => {
    expect(computeDebtInfo({}, NOW).state).toBe('no_date');
  });

  it('nasiya — oxirgi oy kelajakda bo\'lsa ham, o\'tkazib yuborilgan oy «kechikdi»', () => {
    // 6 oylik, 600 000; boshlang'ich yo'q, faqat 1-oy to'langan; 2-oy (15-mart) o'tib ketgan
    const sale = {
      totalAmount: 600_000,
      paidAmount: 100_000,
      remainingAmount: 500_000,
      installmentMonths: 6,
      downPayment: 0,
      payments: [],
      createdAt: new Date('2026-01-15T10:00:00'),
      dueDate: new Date('2026-07-15'),
    } as Partial<ISale> as ISale;
    const info = computeDebtInfo(sale, NOW);
    expect(info.state).toBe('overdue');
    expect(info.dueDate?.getMonth()).toBe(2); // mart
  });

  it('nasiya — jadval bo\'yicha to\'langan bo\'lsa, keyingi oyga qaraydi', () => {
    const sale = {
      totalAmount: 600_000,
      paidAmount: 500_000,
      remainingAmount: 100_000,
      installmentMonths: 6,
      downPayment: 0,
      payments: [],
      createdAt: new Date('2026-01-15T10:00:00'),
      dueDate: new Date('2026-07-15'),
    } as Partial<ISale> as ISale;
    const info = computeDebtInfo(sale, NOW);
    expect(info.state).toBe('on_track');
    expect(info.dueDate?.getMonth()).toBe(6); // iyul
  });
});
