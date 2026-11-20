import { describe, it, expect } from 'vitest';
import { computeInstallmentPlan, installmentDueDate, installmentPaymentNote, leftUpToMonth, spreadShortfall } from '@/lib/installment';

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

  // REGRESSIYA (2026-11-13): qisman to'lovdan keyin oy summasi kamaymayotgandek ko'rinardi —
  // jadval rejadagi summani (amount) chiqarardi. Endi har oyda qolgan qism (left) bor.
  it('qisman to\'lov: oyning qolgan qismi (left) kamayadi, jami qoldiq bilan mos', () => {
    // 4 950 000, boshlang'ich 950 000, 4 oy → oylik 1 000 000; 1-oyga 300 000 to'langan
    const plan = computeInstallmentPlan(
      sale({ totalAmount: 4_950_000, paidAmount: 1_250_000, remainingAmount: 3_700_000, installmentMonths: 4, downPayment: 950_000 })
    )!;
    expect(plan.schedule[0]).toMatchObject({ amount: 1_000_000, paidAmount: 300_000, left: 700_000, state: 'partial' });
    expect(plan.schedule[1].left).toBe(1_000_000);
    // Oylarning qolgan qismlari yig'indisi = sotuv qoldig'i
    expect(plan.schedule.reduce((a, m) => a + m.left, 0)).toBe(3_700_000);
    expect(leftUpToMonth(plan.schedule, 1)).toBe(700_000);
    expect(leftUpToMonth(plan.schedule, 3)).toBe(2_700_000);
  });
});

describe('installmentPaymentNote', () => {
  const plan = (paid: number) => computeInstallmentPlan(
    sale({ totalAmount: 4_000_000, paidAmount: paid, remainingAmount: 4_000_000 - paid, installmentMonths: 4, downPayment: 0 })
  )!.schedule;

  it('bitta oy: to\'liq yoki qisman', () => {
    expect(installmentPaymentNote(plan(0), 1_000_000)).toBe("1-oy to'lovi");
    expect(installmentPaymentNote(plan(0), 300_000)).toBe('1-oy (qisman)');
    // 1-oyga 300 000 to'langan — qolgan 700 000 shu oyni yopadi
    expect(installmentPaymentNote(plan(300_000), 700_000)).toBe("1-oy to'lovi");
  });

  it('to\'lov eng erta to\'lanmagan oydan boshlanadi (bir necha oy)', () => {
    expect(installmentPaymentNote(plan(300_000), 1_700_000)).toBe("1–2-oy to'lovi");
    expect(installmentPaymentNote(plan(1_000_000), 1_500_000)).toBe("2–3-oy (3-oy qisman)");
  });

  it('to\'lanadigan oy qolmagan bo\'lsa izoh yo\'q', () => {
    expect(installmentPaymentNote(plan(4_000_000), 100)).toBeUndefined();
  });
});

describe("to'lov kuni (payDay)", () => {
  it('har oy tanlangan kunda, birinchisi — keyingi oyda', () => {
    const start = new Date(2026, 10, 15, 10, 0); // 15-noyabr
    const d1 = installmentDueDate(start, 1, 5);
    expect([d1.getFullYear(), d1.getMonth(), d1.getDate()]).toEqual([2026, 11, 5]);
    const d2 = installmentDueDate(start, 2, 5);
    expect([d2.getFullYear(), d2.getMonth(), d2.getDate()]).toEqual([2027, 0, 5]);
    // Kun oxirigacha — shu kuni to'lasa kechikkan emas
    expect(d1.getHours()).toBe(23);
  });

  it("qisqa oyda — oy oxiri; tanlanmagan bo'lsa — sotuv sanasi + N oy", () => {
    const start = new Date(2026, 0, 10);
    const feb = installmentDueDate(start, 1, 31);
    expect([feb.getMonth(), feb.getDate()]).toEqual([1, 28]);
    const legacy = installmentDueDate(start, 1, undefined);
    expect([legacy.getMonth(), legacy.getDate()]).toEqual([1, 10]);
  });

  it('jadval muddatlari payDay bo\'yicha', () => {
    const plan = computeInstallmentPlan(sale({
      totalAmount: 3_000_000, remainingAmount: 3_000_000, installmentMonths: 3, downPayment: 0,
      createdAt: new Date(2026, 10, 15), payDay: 25,
    }))!;
    expect(plan.schedule.map((m) => `${m.dueDate.getMonth() + 1}/${m.dueDate.getDate()}`)).toEqual(['12/25', '1/25', '2/25']);
  });
});

describe('spreadShortfall — qisman to\'lov qoldig\'i keyingi oylarga', () => {
  const base = { totalAmount: 12_000_000, installmentMonths: 12, downPayment: 0 };

  it('1 000 000 o\'rniga 800 000: oy yopiladi, 200 000 qolgan 11 oyga bo\'linadi', () => {
    const before = computeInstallmentPlan(sale({ ...base, paidAmount: 0, remainingAmount: 12_000_000 }))!;
    const sp = spreadShortfall(before.schedule, 800_000)!;
    expect(sp).toMatchObject({ month: 1, carry: 200_000, from: 2, to: 12, perMonth: 18_181 });
    expect(sp.amounts[0]).toBe(800_000);
    expect(sp.amounts.reduce((a, x) => a + x, 0)).toBe(12_000_000);
    expect(sp.amounts[11]).toBe(1_000_000 + 200_000 - 18_181 * 10);
    expect(installmentPaymentNote(before.schedule, 800_000, sp)).toMatch(/^1-oy \(qisman\) · .+ so'm 2–12-oylarga bo'lindi$/);

    // To'lovdan keyingi holat: 1-oy to'langan, 2-oy — 1 018 181
    const after = computeInstallmentPlan(sale({ ...base, paidAmount: 800_000, remainingAmount: 11_200_000, installmentAmounts: sp.amounts }))!;
    expect(after.schedule[0]).toMatchObject({ amount: 800_000, planned: 1_000_000, paid: true, state: 'paid' });
    expect(after.schedule[1]).toMatchObject({ amount: 1_018_181, paid: false, left: 1_018_181 });
    expect(after.schedule.reduce((a, m) => a + m.left, 0)).toBe(11_200_000);
  });

  it("to'liq yoki ortiq to'lov, oxirgi oy — bo'linmaydi", () => {
    const p = computeInstallmentPlan(sale({ ...base, paidAmount: 0, remainingAmount: 12_000_000 }))!;
    expect(spreadShortfall(p.schedule, 1_000_000)).toBeNull();
    expect(spreadShortfall(p.schedule, 1_500_000)).toBeNull();
    const last = computeInstallmentPlan(sale({ ...base, paidAmount: 11_000_000, remainingAmount: 1_000_000 }))!;
    expect(spreadShortfall(last.schedule, 400_000)).toBeNull();
  });

  it("qisman qaytarish qarzni kamaytirsa — farq oxirgi oylardan ayiriladi", () => {
    const amounts = [800_000, ...Array(10).fill(1_018_181), 1_018_190];
    const plan = computeInstallmentPlan(sale({ ...base, totalAmount: 11_000_000, paidAmount: 800_000, remainingAmount: 10_200_000, installmentAmounts: amounts }))!;
    expect(plan.schedule.reduce((a, m) => a + m.amount, 0)).toBe(11_000_000);
    expect(plan.schedule[0].amount).toBe(800_000);
    expect(plan.schedule[11].amount).toBe(18_190);
  });
});

describe('computeInstallmentPlan — bank krediti + nasiya', () => {
  const base = sale({
    totalAmount: 12_000_000,
    paidAmount: 0,
    remainingAmount: 4_000_000,
    installmentMonths: 4,
    downPayment: 0,
    bankParts: [
      { bankName: 'Ishonch', amount: 4_000_000 },
      { bankName: 'BirZum', amount: 4_000_000 },
    ],
    createdAt: new Date(2026, 10, 20),
  });

  it('oylik jadval faqat nasiya qismidan (4 mln / 4 oy), banklar qismi kirmaydi', () => {
    const plan = computeInstallmentPlan(base, new Date(2026, 10, 21))!;
    expect(plan.total).toBe(4_000_000);
    expect(plan.bank).toBe(8_000_000);
    expect(plan.monthly).toBe(1_000_000);
    expect(plan.schedule.reduce((a, m) => a + m.amount, 0)).toBe(4_000_000);
    expect(plan.remaining).toBe(4_000_000);
  });

  it('boshlang\'ich to\'lov bilan: 12 mln = 1 mln + banklar 8 mln + nasiya 3 mln / 3 oy', () => {
    const plan = computeInstallmentPlan(
      { ...base, paidAmount: 1_000_000, remainingAmount: 3_000_000, downPayment: 1_000_000, installmentMonths: 3 },
      new Date(2026, 10, 21),
    )!;
    expect(plan.down).toBe(1_000_000);
    expect(plan.monthly).toBe(1_000_000);
    expect(plan.monthsPaid).toBe(0);
  });

  it('mijoz 1-oyni to\'lasa — 1-oy yopiladi', () => {
    const plan = computeInstallmentPlan({ ...base, paidAmount: 1_000_000, remainingAmount: 3_000_000 }, new Date(2026, 10, 21))!;
    expect(plan.schedule[0].paid).toBe(true);
    expect(plan.schedule[1].paid).toBe(false);
    expect(plan.monthsPaid).toBe(1);
  });

  it('oddiy nasiyada bank 0', () => {
    const plan = computeInstallmentPlan(sale({ totalAmount: 600, remainingAmount: 600, installmentMonths: 6 }))!;
    expect(plan.bank).toBe(0);
    expect(plan.total).toBe(600);
  });
});
