import { describe, it, expect } from 'vitest';
import { calcSaleStatus } from '@/lib/sales';
import { datePrefix, formatDocNo } from '@/lib/counters';

describe('hujjat raqami formati', () => {
  it('S/T prefiks + 4 xonali tartib raqami', () => {
    expect(datePrefix('S', new Date(2026, 9, 5))).toBe('S20261005');
    expect(formatDocNo('S20261005', 7)).toBe('S20261005-0007');
    expect(formatDocNo('T20261005', 12345)).toBe('T20261005-12345');
  });
});

describe('sales — to\'lov holati', () => {
  it("to'liq to'langan = paid", () => {
    expect(calcSaleStatus(100000, 100000)).toBe('paid');
    expect(calcSaleStatus(100000, 120000)).toBe('paid');
  });
  it("qisman to'langan = partial", () => {
    expect(calcSaleStatus(100000, 40000)).toBe('partial');
    expect(calcSaleStatus(100000, 0)).toBe('partial');
  });
});
