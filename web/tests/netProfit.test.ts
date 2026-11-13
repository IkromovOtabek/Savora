import { describe, it, expect } from 'vitest';
import { opexFromFlows } from '@/lib/monitoring';
import {
  categoryInProfit,
  DEFAULT_FINANCE_CATEGORIES,
  SHIFT_DEPOSIT_CATEGORY,
  SHIFT_WITHDRAW_CATEGORY,
} from '@/lib/models/tenant/FinanceCategory';

const cats = DEFAULT_FINANCE_CATEGORIES.map((c) => ({ ...c }));

describe('sof foyda — toifa qoidasi', () => {
  it('tizim toifalari va Investitsiya foydaga kirmaydi, qolgani kiradi', () => {
    expect(categoryInProfit({ name: 'Ijara' })).toBe(true);
    expect(categoryInProfit({ name: 'Boshqa kirim' })).toBe(true);
    expect(categoryInProfit({ name: 'Investitsiya' })).toBe(false);
    expect(categoryInProfit({ name: SHIFT_WITHDRAW_CATEGORY, system: true })).toBe(false);
  });

  it("belgi qo'yilgan bo'lsa — o'sha, lekin tizim toifasini yoqib bo'lmaydi", () => {
    expect(categoryInProfit({ name: 'Ijara', inProfit: false })).toBe(false);
    expect(categoryInProfit({ name: 'Investitsiya', inProfit: true })).toBe(true);
    expect(categoryInProfit({ name: SHIFT_DEPOSIT_CATEGORY, system: true, inProfit: true })).toBe(false);
  });
});

describe('sof foyda — kirim/chiqim yozuvlari', () => {
  it('xarajat va boshqa kirimni yig\'adi, foydaga kirmaydiganlarni tashlaydi', () => {
    const r = opexFromFlows(
      [
        { type: 'expense', amount: 3_000_000, category: 'Ijara', branchId: 'b1' },
        { type: 'expense', amount: 2_000_000, category: 'Ish haqi', branchId: 'b2' },
        { type: 'expense', amount: 500_000, category: 'Soliq' },
        { type: 'income', amount: 400_000, category: 'Boshqa kirim', branchId: 'b1' },
        // hisobga kirmaydi:
        { type: 'income', amount: 50_000_000, category: 'Investitsiya' },
        { type: 'expense', amount: 1_000_000, category: SHIFT_WITHDRAW_CATEGORY, branchId: 'b1' },
        { type: 'income', amount: 700_000, category: SHIFT_DEPOSIT_CATEGORY, branchId: 'b1' },
        { type: 'expense', amount: 9_000_000 }, // toifasiz eski yozuv
        { type: 'expense', amount: 9_000_000, category: '  ' },
      ],
      cats,
    );
    expect(r.expense).toBe(5_500_000);
    expect(r.income).toBe(400_000);
    expect(r.byBranch.get('b1')).toEqual({ income: 400_000, expense: 3_000_000 });
    expect(r.byBranch.get('b2')).toEqual({ income: 0, expense: 2_000_000 });
    expect(r.unbranched).toEqual({ income: 0, expense: 500_000 });
    expect(r.byCategory.map((c) => c.category)).toEqual(['Ijara', 'Ish haqi', 'Soliq', 'Boshqa kirim']);
  });

  it('toifa turi mos kelishi shart (kirim toifasi nomi bilan chiqim — hisobga kirmaydi)', () => {
    const r = opexFromFlows([{ type: 'expense', amount: 100, category: 'Boshqa kirim' }], cats);
    expect(r.expense).toBe(0);
    expect(r.byCategory).toEqual([]);
  });

  it('foydadan chiqarilgan toifa hisobga kirmaydi', () => {
    const custom = cats.map((c) => (c.name === 'Reklama' ? { ...c, inProfit: false } : c));
    const r = opexFromFlows([{ type: 'expense', amount: 100, category: 'Reklama' }], custom);
    expect(r.expense).toBe(0);
  });

  it('ObjectId kabi branchId satrga aylantiriladi', () => {
    const id = { toString: () => 'abc' };
    const r = opexFromFlows([{ type: 'expense', amount: 10, category: 'Ijara', branchId: id }], cats);
    expect(r.byBranch.get('abc')?.expense).toBe(10);
  });
});
