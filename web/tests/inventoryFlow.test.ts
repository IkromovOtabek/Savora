/**
 * Kirim-chiqim yig'indilari: dona va kasrli birliklar (kg, m…) bitta songa qo'shilmaydi,
 * qiymat priceTimesQty bilan butun so'mga yaxlitlanadi.
 */
import { describe, it, expect } from 'vitest';
import { aggregateFlowTotals, lineFromProduct, type FlowLine } from '@/lib/inventoryFlow';
import { addQtyByUnit, mergeQtyByUnit, qtyByUnitEntries, singleUnit, unitKey } from '@/lib/unitTotals';
import { qtyByUnits } from '@/lib/i18n/fmt';
import { getDictionary } from '@/lib/i18n';

type ProductArg = Parameters<typeof lineFromProduct>[0];

const product = (over: Partial<ProductArg>): ProductArg =>
  ({
    _id: { toString: () => '64b000000000000000000001' },
    name: 'Mahsulot',
    trackQuantity: true,
    quantity: 0,
    soldQuantity: 0,
    status: 'in_stock',
    purchasePrice: 0,
    salePrice: 0,
    ...over,
  }) as ProductArg;

const line = (qty: number, unit: string | null, revenue = 0, cost = 0): FlowLine => ({
  id: String(Math.random()),
  productId: 'X',
  name: 'n',
  branchName: 'b',
  qty,
  unit,
  unitPurchase: 0,
  unitSale: 0,
  cost,
  revenue,
  profit: revenue - cost,
});

describe('unitTotals', () => {
  it('birligi yo\'q yoki noma\'lum — dona', () => {
    expect(unitKey(undefined)).toBe('dona');
    expect(unitKey(null)).toBe('dona');
    expect(unitKey('tonna')).toBe('dona');
    expect(unitKey('kg')).toBe('kg');
  });

  it('birlik bo\'yicha qo\'shadi va float qoldig\'ini tozalaydi', () => {
    const acc = {};
    addQtyByUnit(acc, 0.1, 'kg');
    addQtyByUnit(acc, 0.2, 'kg');
    addQtyByUnit(acc, 3, null);
    addQtyByUnit(acc, 2, 'dona');
    expect(acc).toEqual({ kg: 0.3, dona: 5 });
  });

  it('merge va tartib (dona birinchi), nollar tashlanadi', () => {
    const m = mergeQtyByUnit([{ kg: 1.5 }, { dona: 2, kg: 0.25 }, { m: 0 }]);
    expect(qtyByUnitEntries(m)).toEqual([['dona', 2], ['kg', 1.75]]);
    expect(singleUnit(m)).toBeNull();
    expect(singleUnit({ kg: 2 })).toBe('kg');
    expect(singleUnit({})).toBeNull();
  });

  it('qtyByUnits: aralash — guruhlab, bo\'sh — 0 dona', () => {
    const uz = getDictionary('uz').stock.fields.units;
    const ru = getDictionary('ru').stock.fields.units;
    expect(qtyByUnits({ dona: 12, kg: 3.5 }, uz)).toBe('12 dona · 3,5 kg');
    expect(qtyByUnits({ l: 2.25 }, uz)).toBe('2,25 litr');
    expect(qtyByUnits({}, uz)).toBe('0 dona');
    expect(qtyByUnits({ dona: 3, m2: 1.2 }, ru)).toMatch(/^3 .+ · 1,2 /);
  });
});

describe('inventoryFlow', () => {
  it('lineFromProduct: kasr qoldiq, birlik va butun so\'mga yaxlitlangan qiymat', () => {
    const l = lineFromProduct(
      product({ unit: 'kg', quantity: 2, soldQuantity: 1.665, purchasePrice: 1999, salePrice: 3001 }),
      'Markaz',
      'stock',
    )!;
    expect(l.qty).toBe(0.335);
    expect(l.unit).toBe('kg');
    expect(l.cost).toBe(670); // 1999 × 0.335 = 669.665 → 670 (float'da 669 chiqardi)
    expect(l.revenue).toBe(1005); // 3001 × 0.335 = 1005.335 → 1005
    expect(l.profit).toBe(335);
  });

  it('lineFromProduct: birligi yo\'q mahsulot — unit null (dona sifatida yig\'iladi)', () => {
    const l = lineFromProduct(product({ quantity: 5, soldQuantity: 2, purchasePrice: 100 }), 'B', 'stock')!;
    expect(l.qty).toBe(3);
    expect(l.unit).toBeNull();
    expect(l.cost).toBe(300);
  });

  it('lineFromProduct: qoldiq/sotuv yo\'q — null', () => {
    expect(lineFromProduct(product({ quantity: 1, soldQuantity: 1 }), 'B', 'stock')).toBeNull();
    expect(lineFromProduct(product({ quantity: 1, soldQuantity: 0 }), 'B', 'sold')).toBeNull();
  });

  it('aggregateFlowTotals: dona va kg alohida, summalar oddiy qo\'shiladi', () => {
    const totals = aggregateFlowTotals(
      [line(3, null, 0, 300), line(1.5, 'kg', 0, 450), line(0.25, 'kg', 0, 75), line(2, 'dona', 0, 20)],
      [line(1, 'dona', 1000, 600), line(0.1, 'kg', 30, 20), line(0.2, 'kg', 60, 40), line(2.5, 'm', 500, 300)],
    );
    expect(totals.stockQty).toEqual({ dona: 5, kg: 1.75 });
    expect(totals.soldQty).toEqual({ dona: 1, kg: 0.3, m: 2.5 });
    expect(totals.stockCost).toBe(845);
    expect(totals.soldRevenue).toBe(1590);
    expect(totals.profit).toBe(630);
  });

  it('aggregateFlowTotals: bo\'sh ro\'yxat', () => {
    expect(aggregateFlowTotals([], [])).toEqual({ stockQty: {}, soldQty: {}, stockCost: 0, soldRevenue: 0, profit: 0 });
  });
});
