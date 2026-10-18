import { describe, it, expect } from 'vitest';
import { allocateDiscount, discountAmount, unitPriceFor } from '@/lib/posCart';

describe('discountAmount', () => {
  it('foiz va summa; chegaralar', () => {
    expect(discountAmount(1_000_000, { kind: 'percent', value: 15 })).toBe(150_000);
    expect(discountAmount(333, { kind: 'percent', value: 50 })).toBe(167); // yaxlitlash
    expect(discountAmount(1_000, { kind: 'amount', value: 250 })).toBe(250);
    expect(discountAmount(1_000, { kind: 'amount', value: 5_000 })).toBe(1_000); // jamidan oshmaydi
    expect(discountAmount(1_000, { kind: 'percent', value: 150 })).toBe(1_000); // 100% dan oshmaydi
    expect(discountAmount(1_000, { kind: 'percent', value: 0 })).toBe(0);
    expect(discountAmount(0, { kind: 'percent', value: 30 })).toBe(0);
    expect(discountAmount(1_000, null)).toBe(0);
  });
});

describe('allocateDiscount', () => {
  it("summaga mutanosib bo'ladi, yig'indi aniq teng", () => {
    const parts = allocateDiscount([600_000, 300_000, 100_000], 100_000);
    expect(parts).toEqual([60_000, 30_000, 10_000]);
  });

  it("qoldiq so'mlar taqsimlanadi, hech bir qator manfiy bo'lmaydi", () => {
    const lines = [333, 333, 334];
    const parts = allocateDiscount(lines, 101);
    expect(parts.reduce((s, n) => s + n, 0)).toBe(101);
    parts.forEach((p, i) => { expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThanOrEqual(lines[i]); });
  });

  it("chegirma jamidan katta bo'lsa — jamigacha qisqaradi", () => {
    expect(allocateDiscount([100, 50], 1_000)).toEqual([100, 50]);
  });

  it("chegirma yo'q — nollar", () => {
    expect(allocateDiscount([100, 200], 0)).toEqual([0, 0]);
  });
});

describe('unitPriceFor', () => {
  it('ulgurji rejimda ulgurji narx (bo\'lsa), aks holda sotuv narxi', () => {
    const p = { salePrice: 10_000, wholesalePrice: 8_000 };
    expect(unitPriceFor(p, false)).toBe(10_000);
    expect(unitPriceFor(p, true)).toBe(8_000);
    expect(unitPriceFor({ salePrice: 10_000 }, true)).toBe(10_000);
    expect(unitPriceFor({ salePrice: 10_000, wholesalePrice: 0 }, true)).toBe(10_000);
  });
});
