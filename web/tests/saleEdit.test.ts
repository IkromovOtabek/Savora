import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { computePriceEdit, respreadInstallmentAmounts, type PriceEditInput } from '@/lib/saleEdit';
import { computeInstallmentPlan } from '@/lib/installment';
import { extractKassaPayments } from '@/lib/kassa';
import { sumCashFromSales } from '@/lib/cashKassa';
import { saleProfitParts, profitToDate } from '@/lib/saleProfit';
import { saleSearchFilter } from '@/lib/saleSearch';
import type { ISale } from '@/lib/models/tenant/Sale';

function input(over: Partial<PriceEditInput> = {}): PriceEditInput {
  return { totalAmount: 150_000, paidAmount: 150_000, remainingAmount: 0, paymentType: 'cash', status: 'paid', ...over };
}

describe('computePriceEdit', () => {
  it("naqd sotuv arzonlashdi: farq mijozga naqd qaytariladi, sotuv to'langan bo'lib qoladi", () => {
    const r = computePriceEdit(input(), 15_000);
    expect(r).toEqual({
      ok: true,
      calc: { delta: -135_000, debtReduced: 0, refundAmount: 135_000, newTotal: 15_000, newPaid: 15_000, newRemaining: 0, newStatus: 'paid' },
    });
  });

  it("naqd sotuv qimmatlashdi: farq qoldiqqa qo'shiladi (to'lov keyin qabul qilinadi)", () => {
    const r = computePriceEdit(input({ totalAmount: 15_000, paidAmount: 15_000 }), 150_000);
    expect(r.ok && r.calc).toMatchObject({ delta: 135_000, refundAmount: 0, newPaid: 15_000, newRemaining: 135_000, newStatus: 'partial' });
  });

  it('qarzli sotuv arzonlashdi: avval qarz kamayadi, pul qaytmaydi', () => {
    const r = computePriceEdit(input({ paymentType: 'debt', status: 'partial', totalAmount: 1_000_000, paidAmount: 300_000, remainingAmount: 700_000 }), 900_000);
    expect(r.ok && r.calc).toMatchObject({ debtReduced: 100_000, refundAmount: 0, newPaid: 300_000, newRemaining: 600_000, newStatus: 'partial' });
  });

  it("qarz yopilib, ortig'i qaytariladi", () => {
    const r = computePriceEdit(input({ paymentType: 'debt', status: 'partial', totalAmount: 1_000_000, paidAmount: 300_000, remainingAmount: 700_000 }), 200_000);
    expect(r.ok && r.calc).toMatchObject({ debtReduced: 700_000, refundAmount: 100_000, newPaid: 200_000, newRemaining: 0, newStatus: 'paid' });
  });

  it('bekor qilingan, bank krediti, bank + nasiya — narx o\'zgarmaydi', () => {
    expect(computePriceEdit(input({ status: 'cancelled' }), 1)).toEqual({ ok: false, error: 'cancelled' });
    expect(computePriceEdit(input({ paymentType: 'bank_credit' }), 1)).toEqual({ ok: false, error: 'bankCredit' });
    expect(computePriceEdit(input({ paymentType: 'installment', bankParts: [{ amount: 100 }] }), 1)).toEqual({ ok: false, error: 'bankCredit' });
  });

  it("noto'g'ri summa, o'sha narx, nasiyada boshlang'ichdan kam", () => {
    expect(computePriceEdit(input(), 0)).toEqual({ ok: false, error: 'badAmount' });
    expect(computePriceEdit(input(), 1.5)).toEqual({ ok: false, error: 'badAmount' });
    expect(computePriceEdit(input(), 150_000)).toEqual({ ok: false, error: 'same' });
    expect(computePriceEdit(input({ paymentType: 'installment', status: 'partial', downPayment: 200_000 }), 200_000)).toEqual({ ok: false, error: 'belowDown' });
  });
});

describe('respreadInstallmentAmounts', () => {
  const sched = (amounts: number[], paidCount: number) => amounts.map((amount, i) => ({ amount, paid: i < paidCount }));

  it("to'langan oylar o'zgarmaydi, farq qolgan oylarga teng bo'linadi", () => {
    expect(respreadInstallmentAmounts(sched([100, 100, 100, 100], 2), 460)).toEqual([100, 100, 130, 130]);
    expect(respreadInstallmentAmounts(sched([100, 100, 100, 100], 1), 401)).toEqual([100, 100, 100, 101]);
  });

  it("hamma oy to'langan — farq oxirgi oyga", () => {
    expect(respreadInstallmentAmounts(sched([100, 100, 100], 3), 350)).toEqual([100, 100, 150]);
  });

  it("qolgan oylarga 1 so'mdan kam tushsa — null (teng bo'linadi)", () => {
    expect(respreadInstallmentAmounts(sched([100, 100, 100, 100], 2), 201)).toBeNull();
    expect(respreadInstallmentAmounts(sched([100, 100, 100], 2), 150)).toBeNull();
  });

  it('nasiya jadvali: narx oshgach to\'langan oy to\'langanligicha qoladi', () => {
    const createdAt = new Date('2026-01-10T10:00:00Z');
    const sale = {
      totalAmount: 1_300_000, paidAmount: 400_000, remainingAmount: 900_000, installmentMonths: 3, downPayment: 100_000,
      payments: [{ amount: 100_000, paidAt: createdAt }, { amount: 300_000, paidAt: createdAt }], createdAt,
    } as unknown as ISale;
    const before = computeInstallmentPlan(sale)!;
    expect(before.schedule.map((m) => m.amount)).toEqual([400_000, 400_000, 400_000]);
    const calc = computePriceEdit({ ...sale, paymentType: 'installment', status: 'partial', downPayment: before.down }, 1_600_000);
    expect(calc.ok).toBe(true);
    if (!calc.ok) return;
    const amounts = respreadInstallmentAmounts(before.schedule, calc.calc.newTotal - before.down)!;
    const after = computeInstallmentPlan({ ...sale, totalAmount: 1_600_000, remainingAmount: calc.calc.newRemaining, installmentAmounts: amounts } as ISale)!;
    // 1-oy (300 000 to'langan) qisman edi — u ham ochiq oy; to'liq to'langan oy yo'q
    expect(after.schedule.map((m) => m.amount)).toEqual([500_000, 500_000, 500_000]);
    expect(after.remaining).toBe(1_200_000);
  });
});

describe("narx tuzatilishi kassa va foydada qaytarish kabi", () => {
  const day = new Date('2026-11-24T00:00:00Z');
  const at = new Date('2026-11-24T08:00:00Z');
  const sale = {
    _id: new Types.ObjectId(), saleNo: 'S-1', branchId: new Types.ObjectId(), paymentType: 'cash', status: 'paid',
    totalAmount: 15_000, paidAmount: 15_000, remainingAmount: 0,
    productSnapshot: { name: 'Kabel', imei: 'K1', purchasePrice: 10_000 }, createdAt: at,
    payments: [{ amount: 150_000, paidAt: at, method: 'cash' }],
    returns: [{ kind: 'price', qty: 0, amount: 135_000, debtReduced: 0, refundAmount: 135_000, returnedAt: at, by: 'ali' }],
  } as unknown as ISale & { _id: unknown };

  it('kunlik kassa: +150 000 − 135 000 = 15 000', () => {
    const rows = extractKassaPayments([sale], day, new Date(day.getTime() + 86_400_000));
    expect(rows.reduce((a, r) => a + r.amount, 0)).toBe(15_000);
    expect(sumCashFromSales([sale]).get(String(sale.branchId))).toBe(15_000);
  });

  it('foyda yangi narx bo\'yicha', () => {
    expect(profitToDate(saleProfitParts(sale, 10_000))).toBe(5_000);
  });
});

describe('saleSearchFilter', () => {
  it("bo'sh — filtr yo'q", () => {
    expect(saleSearchFilter('  ')).toBeNull();
    expect(saleSearchFilter(undefined)).toBeNull();
  });

  it('raqam — telefon (oxirgi 9 raqam), sotuv raqami, IMEI', () => {
    const f = saleSearchFilter('+998 90 123-45-67') as { $or: Record<string, { $regex: string }>[] };
    expect(f.$or[0]['customerSnapshot.phone'].$regex).toBe('9\\D*0\\D*1\\D*2\\D*3\\D*4\\D*5\\D*6\\D*7');
    expect(new RegExp(f.$or[0]['customerSnapshot.phone'].$regex).test('+998 (90) 123 45 67')).toBe(true);
  });

  it("matn — har so'z biror maydonda, regex ekranlangan", () => {
    const f = saleSearchFilter('iphone (ali') as { $and: { $or: Record<string, { $regex: string }>[] }[] };
    expect(f.$and).toHaveLength(2);
    expect(f.$and[1].$or[0]['productSnapshot.name'].$regex).toBe('\\(ali');
  });
});
