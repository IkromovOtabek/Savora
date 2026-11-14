import { describe, it, expect } from 'vitest';
import { fillBankParts, splitProportional, splitSale } from '@/lib/saleSplit';

const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);

describe('splitProportional', () => {
  it('yig\'indi aniq, mutanosib', () => {
    expect(splitProportional([10_000_000, 5_000_000], 15_000_000)).toEqual([10_000_000, 5_000_000]);
    expect(splitProportional([10_000_000, 5_000_000], 12_000_000)).toEqual([8_000_000, 4_000_000]);
    const odd = splitProportional([1, 1, 1], 100);
    expect(sum(odd)).toBe(100);
    expect(odd).toEqual([34, 33, 33]);
  });

  it('summa ≤ og\'irliklar bo\'lsa hech bir qator o\'z og\'irligidan oshmaydi', () => {
    const w = [7, 3, 11, 1, 999];
    for (let a = 0; a <= sum(w); a += 7) {
      const p = splitProportional(w, a);
      expect(sum(p)).toBe(a);
      p.forEach((x, i) => expect(x).toBeLessThanOrEqual(w[i]));
      p.forEach((x) => expect(x).toBeGreaterThanOrEqual(0));
    }
  });

  it('ustama (summa > og\'irliklar) ham to\'liq taqsimlanadi; 0 og\'irlikka tushmaydi', () => {
    const p = splitProportional([1_000, 0, 3_000], 5_000);
    expect(sum(p)).toBe(5_000);
    expect(p[1]).toBe(0);
  });

  it('chekka holatlar', () => {
    expect(splitProportional([], 100)).toEqual([]);
    expect(splitProportional([0, 0], 100)).toEqual([100, 0]);
    expect(splitProportional([5, 5], 0)).toEqual([0, 0]);
  });
});

describe('fillBankParts', () => {
  it('har qator qoldig\'i va har bank summasi saqlanadi', () => {
    const needs = [6_000_000, 2_000_000];
    const banks = [{ bankName: 'Ishonch', amount: 3_000_000 }, { bankName: 'Uzum', amount: 5_000_000 }];
    const out = fillBankParts(needs, banks);
    expect(out).toEqual([
      [{ bankName: 'Ishonch', amount: 3_000_000 }, { bankName: 'Uzum', amount: 3_000_000 }],
      [{ bankName: 'Uzum', amount: 2_000_000 }],
    ]);
    out.forEach((line, i) => expect(sum(line.map((p) => p.amount))).toBe(needs[i]));
  });

  it('qoldig\'i 0 qator o\'tkazib yuboriladi', () => {
    expect(fillBankParts([0, 500], [{ bankName: 'A', amount: 500 }])).toEqual([[], [{ bankName: 'A', amount: 500 }]]);
  });
});

describe('splitSale', () => {
  it('2 telefon bank kreditiga: chegirma, bosh to\'lov va 2 bank', () => {
    // Ro'yxat: 14,2 mln + 11,2 mln = 25,4 mln; sotildi 25 mln, bosh to'lov 5 mln, qolgan 20 mln — 2 bankka
    const lines = splitSale({
      listTotals: [14_200_000, 11_200_000],
      total: 25_000_000,
      paid: 5_000_000,
      bankParts: [{ bankName: 'Ishonch', amount: 12_000_000 }, { bankName: 'Uzum', amount: 8_000_000 }],
    });
    expect(sum(lines.map((l) => l.total))).toBe(25_000_000);
    expect(sum(lines.map((l) => l.paid))).toBe(5_000_000);
    for (const l of lines) {
      expect(l.paid).toBeLessThanOrEqual(l.total);
      expect(sum(l.bankParts!.map((p) => p.amount))).toBe(l.total - l.paid);
    }
    const byBank = (name: string) => sum(lines.flatMap((l) => l.bankParts!.filter((p) => p.bankName === name).map((p) => p.amount)));
    expect(byBank('Ishonch')).toBe(12_000_000);
    expect(byBank('Uzum')).toBe(8_000_000);
  });

  it('qarzga: bank ulushi yo\'q, to\'langan qism mutanosib', () => {
    const lines = splitSale({ listTotals: [300_000, 100_000], total: 400_000, paid: 100_000 });
    expect(lines).toEqual([{ total: 300_000, paid: 75_000 }, { total: 100_000, paid: 25_000 }]);
  });

  it('to\'lov jamidan oshsa — jamiga qisqartiriladi', () => {
    const lines = splitSale({ listTotals: [100, 100], total: 200, paid: 999 });
    expect(lines.map((l) => l.paid)).toEqual([100, 100]);
  });
});
