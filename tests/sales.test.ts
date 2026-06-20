import { describe, it, expect } from 'vitest';
import { calcSaleStatus } from '@/lib/sales';

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
