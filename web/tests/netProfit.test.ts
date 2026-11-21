import { describe, it, expect } from 'vitest';
import { opexFromFlows, profitReport } from '@/lib/monitoring';
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

describe('sof foyda — mobil hisobot (profitReport)', () => {
  const branches = [{ id: 'b1', name: 'Chilonzor' }, { id: 'b2', name: 'Yunusobod' }];
  const start = new Date(2026, 10, 1);
  const end = new Date(2026, 11, 1);
  const at = (d: number) => new Date(2026, 10, d, 12);

  it('xarajat sof foydadan ayiriladi; filial va kun bo\'yicha sabab bilan', () => {
    const r = profitReport({
      lines: [
        { branchId: 'b1', revenue: 5_000_000, cost: 4_000_000, at: at(3) },
        { branchId: 'b2', revenue: 2_000_000, cost: 1_500_000, at: at(3) },
        { branchId: 'eski', revenue: 999, cost: 0, at: at(3) }, // nofaol filial sotuvi — yalpiga kirmaydi (web kabi)
      ],
      flows: [
        { type: 'expense', amount: 1_200_000, category: 'Ijara', branchId: 'b1', createdAt: at(1) },
        { type: 'expense', amount: 300_000, category: 'Reklama', createdAt: at(12) },
        { type: 'expense', amount: 500_000, category: 'Kassadan olindi', branchId: 'b2', createdAt: at(1) }, // tizim — kirmaydi
        { type: 'income', amount: 100_000, category: 'Boshqa kirim', branchId: 'b2', createdAt: at(3) },
        { type: 'income', amount: 9_000_000, category: 'Investitsiya', createdAt: at(3) }, // egasining puli — kirmaydi
      ],
      categories: cats,
      branches,
      start,
      end,
    });
    expect(r.gross).toBe(1_500_000);
    expect(r.expense).toBe(1_500_000);
    expect(r.otherIncome).toBe(100_000);
    expect(r.net).toBe(100_000);

    const b1 = r.byBranch.find((b) => b.id === 'b1')!;
    expect(b1.net).toBe(-200_000); // Chilonzor ijara tufayli zarar
    expect(b1.top).toEqual({ category: 'Ijara', amount: 1_200_000 });
    const rest = r.byBranch.find((b) => b.id === null)!;
    expect(rest.expense).toBe(300_000); // filialsiz reklama alohida qatorda
    expect(rest.top?.category).toBe('Reklama');
    expect(r.byBranch.reduce((s, b) => s + b.net, 0)).toBe(r.net);

    expect(r.daily).toHaveLength(30); // noyabrning har kuni
    expect(r.daily.reduce((s, d) => s + d.net, 0)).toBe(r.net);
    expect(r.daily[0]).toMatchObject({ day: '2026-11-01', net: -1_200_000, top: { category: 'Ijara', amount: 1_200_000 } });
    expect(r.daily[2].net).toBe(1_600_000);
  });

  it('bankdan olingan pul olingan kuni yalpi foydaga kiradi; filialsizi «Umumiy» qatorida', () => {
    const r = profitReport({
      // Bank krediti sotuvi: tushum bank ulushisiz keladi (saleProfitRevenue), tannarx to'liq
      lines: [{ branchId: 'b1', revenue: 1_000_000, cost: 9_000_000, at: at(2) }],
      flows: [],
      categories: cats,
      branches,
      receipts: [
        { amount: 9_500_000, branchId: 'b1', at: at(10) },
        { amount: 400_000, branchId: null, at: at(10) }, // filialsiz eski yozuv (2 filial) — rest
      ],
      start,
      end,
    });
    expect(r.bankReceived).toBe(9_900_000);
    expect(r.gross).toBe(1_900_000);
    expect(r.net).toBe(1_900_000);
    expect(r.byBranch.find((b) => b.id === 'b1')!.gross).toBe(1_500_000);
    expect(r.byBranch.find((b) => b.id === null)!.gross).toBe(400_000);
    expect(r.byBranch.reduce((s, b) => s + b.net, 0)).toBe(r.net);
    expect(r.daily[1].net).toBe(-8_000_000); // sotuv kuni: bank ulushi hali olinmagan
    expect(r.daily[9].net).toBe(9_900_000); // pul olingan kun
  });

  it('filial bitta bo\'lsa filialsiz bank puli o\'sha filialga', () => {
    const r = profitReport({
      lines: [], flows: [], categories: cats, branches: [branches[0]], start, end,
      receipts: [{ amount: 500_000, branchId: null, at: at(4) }],
    });
    expect(r.byBranch).toEqual([expect.objectContaining({ id: 'b1', gross: 500_000, net: 500_000 })]);
  });

  it('xarajat yo\'q bo\'lsa filialsiz qator qo\'shilmaydi', () => {
    const r = profitReport({ lines: [], flows: [], categories: cats, branches, start, end });
    expect(r.byBranch).toHaveLength(2);
    expect(r.byBranch[0].top).toBeNull();
    expect(r.net).toBe(0);
  });
});
