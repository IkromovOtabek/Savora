import { describe, it, expect } from 'vitest';
import { hasValidGtinCheckDigit, isRetailBarcode, offProductName } from '@/lib/barcodeLookup';

describe('shtrix-kod tekshiruvi', () => {
  it('EAN-13 nazorat raqami', () => {
    expect(hasValidGtinCheckDigit('4780000000007')).toBe(true);
    expect(hasValidGtinCheckDigit('5449000000996')).toBe(true); // Coca-Cola
    expect(hasValidGtinCheckDigit('5449000000997')).toBe(false);
  });
  it('EAN-8 va UPC-A', () => {
    expect(hasValidGtinCheckDigit('96385074')).toBe(true);
    expect(hasValidGtinCheckDigit('036000291452')).toBe(true);
  });
  it('raqam bo\'lmagan yoki uzunligi noto\'g\'ri kod', () => {
    expect(isRetailBarcode('SVR-123')).toBe(false);
    expect(isRetailBarcode('12345')).toBe(false);
    expect(hasValidGtinCheckDigit('353456789012345')).toBe(false); // IMEI (15)
  });
});

describe('offProductName', () => {
  it('mahalliy nom ustun, hajm qo\'shiladi', () => {
    expect(offProductName({ product_name: 'Pepsi', product_name_ru: 'Пепси', quantity: '1,5 l' })).toBe('Пепси 1,5 l');
  });
  it('hajm nomda bo\'lsa takrorlanmaydi', () => {
    expect(offProductName({ product_name: 'Coca-Cola 0.5 L', quantity: '0.5 l' })).toBe('Coca-Cola 0.5 L');
  });
  it('nom yo\'q — null', () => {
    expect(offProductName({ quantity: '1 l' })).toBeNull();
  });
});
