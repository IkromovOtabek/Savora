import { describe, it, expect } from 'vitest';
import { getStockQty, getSoldQty, parseQtyField, resolveStatusAfterSale } from '@/lib/productQuantity';

describe('productQuantity — qoldiq/sotuv hisobi', () => {
  it('getStockQty: tracked = quantity - soldQuantity', () => {
    expect(getStockQty({ trackQuantity: true, quantity: 10, soldQuantity: 3, status: 'in_stock' })).toBe(7);
    expect(getStockQty({ trackQuantity: true, quantity: 5, soldQuantity: 5, status: 'sold' })).toBe(0);
    // manfiy bo'lmasligi kerak
    expect(getStockQty({ trackQuantity: true, quantity: 2, soldQuantity: 9, status: 'sold' })).toBe(0);
  });

  it('getStockQty: tracked emas — status bo\'yicha 1 yoki 0', () => {
    expect(getStockQty({ trackQuantity: false, quantity: 1, soldQuantity: 0, status: 'in_stock' })).toBe(1);
    expect(getStockQty({ trackQuantity: false, quantity: 1, soldQuantity: 0, status: 'sold' })).toBe(0);
  });

  it('getSoldQty', () => {
    expect(getSoldQty({ trackQuantity: true, quantity: 10, soldQuantity: 4, status: 'in_stock' })).toBe(4);
    expect(getSoldQty({ trackQuantity: false, quantity: 1, soldQuantity: 0, status: 'sold' })).toBe(1);
  });

  it('parseQtyField: noto\'g\'ri qiymatlar fallback', () => {
    expect(parseQtyField('5')).toBe(5);
    expect(parseQtyField('0')).toBe(1);
    expect(parseQtyField('-3')).toBe(1);
    expect(parseQtyField('abc')).toBe(1);
    expect(parseQtyField('2.9')).toBe(2);
    expect(parseQtyField('', 7)).toBe(7);
  });

  it('resolveStatusAfterSale', () => {
    expect(resolveStatusAfterSale(false, 1, 1)).toBe('sold');
    expect(resolveStatusAfterSale(true, 10, 10)).toBe('sold');
    expect(resolveStatusAfterSale(true, 10, 4)).toBe('in_stock');
  });
});
