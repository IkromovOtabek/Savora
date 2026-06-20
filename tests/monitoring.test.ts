import { describe, it, expect } from 'vitest';
import { statsFromSales, monthRange } from '@/lib/monitoring';

// Minimal sale yasovchi
function sale(over: Record<string, unknown>) {
  return {
    status: 'paid',
    createdAt: new Date('2026-06-15'),
    totalAmount: 0,
    paidAmount: 0,
    remainingAmount: 0,
    productSnapshot: { purchasePrice: 0, saleQuantity: 1 },
    ...over,
  } as never;
}

describe('monitoring — oylik hisob', () => {
  it('monthRange to\'g\'ri oraliq beradi', () => {
    const { start, end } = monthRange(2026, 6);
    expect(start.getMonth()).toBe(5); // iyun (0-indeks)
    expect(end.getMonth()).toBe(6); // iyul boshi
  });

  it('statsFromSales aylanma va foydani hisoblaydi', () => {
    const { start, end } = monthRange(2026, 6);
    const sales = [
      sale({ totalAmount: 100000, paidAmount: 100000, productSnapshot: { purchasePrice: 60000, saleQuantity: 1 } }),
      sale({ totalAmount: 50000, paidAmount: 20000, remainingAmount: 30000, status: 'partial', productSnapshot: { purchasePrice: 30000, saleQuantity: 1 } }),
    ];
    const stats = statsFromSales(sales, start, end);
    expect(stats.salesCount).toBe(2);
    expect(stats.revenue).toBe(150000);
    expect(stats.paid).toBe(120000);
    expect(stats.debt).toBe(30000);
    expect(stats.profit).toBe(60000); // (100-60)+(50-30)
  });

  it('bekor qilingan va oydan tashqari sotuvlar hisobga olinmaydi', () => {
    const { start, end } = monthRange(2026, 6);
    const sales = [
      sale({ totalAmount: 100000, status: 'cancelled' }),
      sale({ totalAmount: 100000, createdAt: new Date('2026-05-01') }), // boshqa oy
    ];
    const stats = statsFromSales(sales, start, end);
    expect(stats.salesCount).toBe(0);
    expect(stats.revenue).toBe(0);
  });
});
