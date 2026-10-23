import { describe, it, expect } from 'vitest';
import { catalogNameKey, hasValidGtinCheckDigit, isRetailBarcode, isSharedBarcode, offProductName, pickCatalogName } from '@/lib/barcodeLookup';

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

describe('umumiy shtrix-kod lug\'ati', () => {
  it('ichki (tarozi/do\'kon) kodlari lug\'atga tushmaydi', () => {
    expect(isSharedBarcode('4780000000007')).toBe(true);
    expect(isSharedBarcode('5449000000996')).toBe(true);
    expect(isSharedBarcode('2000000000008')).toBe(false); // 2xx — do'kon ichki
    expect(isSharedBarcode('0400000000008')).toBe(false); // 04x — do'kon ichki
    expect(isSharedBarcode('036000291452')).toBe(true);   // UPC-A
    expect(isSharedBarcode('96385074')).toBe(true);       // EAN-8
    expect(isSharedBarcode('5449000000997')).toBe(false); // nazorat raqami xato
  });
  it('nom kaliti — katta-kichik harf va probellar farqi yo\'q', () => {
    expect(catalogNameKey('  Pepsi   1.5 L ')).toBe('pepsi 1.5 l');
  });
  it('ko\'pchilik bergan nom tanlanadi, teng bo\'lsa — yangisi', () => {
    const r = (name: string) => ({ name, nameKey: catalogNameKey(name) });
    expect(pickCatalogName([r('Pepsi 1,5l'), r('Pepsi 1.5 L'), r('pepsi 1.5 l')])).toBe('Pepsi 1.5 L');
    expect(pickCatalogName([r('Choy Ahmad'), r('Ahmad Tea')])).toBe('Choy Ahmad');
    expect(pickCatalogName([])).toBeNull();
  });
});
