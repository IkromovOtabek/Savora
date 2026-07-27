import { describe, it, expect } from 'vitest';
import { computeInstallmentPlan } from '@/lib/installment';

// Yordamchi — minimal sotuv obyekti
function sale(over: Partial<Parameters<typeof computeInstallmentPlan>[0]> = {}) {
  return {
    totalAmount: 0,
    paidAmount: 0,
    remainingAmount: 0,
    installmentMonths: undefined,
    payments: [],
    ...over,
  } as Parameters<typeof computeInstallmentPlan>[0];
}

describe('computeInstallmentPlan', () => {
  it('nasiya bo\'lmasa null', () => {
    expect(computeInstallmentPlan(sale({ installmentMonths: undefined }))).toBeNull();
    expect(computeInstallmentPlan(sale({ installmentMonths: 0 }))).toBeNull();
  });

  it('screenshot holati: 13 080 000 / 6 oy, boshlang\'ich 0', () => {
    const plan = computeInstallmentPlan(
      sale({ totalAmount: 13_080_000, paidAmount: 0, remainingAmount: 13_080_000, installmentMonths: 6, payments: [] })
    )!;
    expect(plan.down).toBe(0);
    expect(plan.monthly).toBe(2_180_000);
    expect(plan.monthsPaid).toBe(0);
    expect(plan.schedule).toHaveLength(6);
    expect(plan.schedule.every((m) => m.amount === 2_180_000 && !m.paid)).toBe(true);
    expect(plan.schedule.reduce((a, m) => a + m.amount, 0)).toBe(13_080_000);
  });

  // REGRESSIYA: boshlang'ichsiz nasiyada birinchi oyni to'lasa — u "To'langan" bo'lishi shart.
  // Ilgari down = payments[0] bo'lgani uchun birinchi to'lov boshlang'ich deb hisoblanib,
  // hech qaysi oy to'langan ko'rinmasdi (asosiy bug).
  it('boshlang\'ichsiz nasiya: 1-oyni to\'lasa To\'landi bo\'ladi', () => {
    const plan = computeInstallmentPlan(
      sale({
        totalAmount: 13_080_000, paidAmount: 2_180_000, remainingAmount: 10_900_000,
        installmentMonths: 6, downPayment: 0,
        payments: [{ amount: 2_180_000, paidAt: new Date(), note: '1-oy to\'lovi' }],
      })
    )!;
    expect(plan.down).toBe(0);
    expect(plan.monthsPaid).toBe(1);
    expect(plan.schedule[0].paid).toBe(true);
    expect(plan.schedule[0].state).toBe('paid');
  });

  // Qisman to'lov oyga taqsimlanishi shart (foydalanuvchi shikoyati).
  it('qisman to\'lov 1-oyga qisman qo\'llanadi (partial holat)', () => {
    const plan = computeInstallmentPlan(
      sale({
        totalAmount: 13_080_000, paidAmount: 1_000_000, remainingAmount: 12_080_000,
        installmentMonths: 6, downPayment: 0,
        payments: [{ amount: 1_000_000, paidAt: new Date(), note: '1-oy (qisman)' }],
      })
    )!;
    expect(plan.monthsPaid).toBe(0); // to'liq oy yo'q
    expect(plan.schedule[0].paidAmount).toBe(1_000_000); // lekin 1-oyga hisoblanadi
    expect(plan.schedule[0].paid).toBe(false);
    expect(plan.schedule[0].state).toBe('partial');
    expect(plan.schedule[1].paidAmount).toBe(0);
  });

  it('boshlang\'ich (downPayment) + qisman to\'langan oylar', () => {
    // narx 1 200 000, boshlang'ich 200 000, 5 oy → oylik 200 000
    // jami to'langan 600 000 → boshlang'ichdan keyin 400 000 = 2 oy
    const plan = computeInstallmentPlan(
      sale({
        totalAmount: 1_200_000, paidAmount: 600_000, remainingAmount: 600_000,
        installmentMonths: 5, downPayment: 200_000,
        payments: [{ amount: 200_000, paidAt: new Date(), note: 'Boshlang\'ich to\'lov' }, { amount: 400_000, paidAt: new Date() }],
      })
    )!;
    expect(plan.down).toBe(200_000);
    expect(plan.monthly).toBe(200_000);
    expect(plan.monthsPaid).toBe(2);
    expect(plan.schedule.slice(0, 2).every((m) => m.paid)).toBe(true);
    expect(plan.schedule.slice(2).every((m) => !m.paid)).toBe(true);
  });

  it('holat: to\'lanmagan oy muddat kelmagan (upcoming) yoki muddat o\'tgan (overdue)', () => {
    const start = new Date('2026-01-01');
    const now = new Date('2026-03-15'); // 2 oy o'tgan
    const plan = computeInstallmentPlan(
      sale({ totalAmount: 6_000_000, paidAmount: 0, remainingAmount: 6_000_000, installmentMonths: 6, downPayment: 0, createdAt: start }),
      now
    )!;
    // 1-oy (fevral) va 2-oy (mart 1) muddati o'tgan; keyingilari kelmagan
    expect(plan.schedule[0].state).toBe('overdue');
    expect(plan.schedule[1].state).toBe('overdue');
    expect(plan.schedule[3].state).toBe('upcoming');
    expect(plan.overdueCount).toBe(2);
  });

  it('yaxlitlash qoldig\'i oxirgi oyga qo\'shiladi (jami aniq)', () => {
    const plan = computeInstallmentPlan(
      sale({ totalAmount: 1000, paidAmount: 0, remainingAmount: 1000, installmentMonths: 3, payments: [] })
    )!;
    expect(plan.monthly).toBe(333);
    expect(plan.schedule.map((m) => m.amount)).toEqual([333, 333, 334]);
    expect(plan.schedule.reduce((a, m) => a + m.amount, 0)).toBe(1000);
  });
});
