import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  GS, cleanScan, fixKeyboardLayout, gs1Date, gtinBarcodes, gtinToBarcode, isExpiredOn, isMarkingCode, isValidGtin,
  localDateKey, markingLabel, parseGs1, scanToBarcode,
} from '@/lib/gs1';

const GTIN = '04780069000130';
const NOW = new Date(2026, 10, 18); // 2026-11-18
const CRYPTO44 = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789+/=ABCDE'.slice(0, 44);

describe('GTIN', () => {
  it('nazorat raqami', () => {
    expect(isValidGtin(GTIN)).toBe(true);
    expect(isValidGtin('4780069000130')).toBe(true);
    expect(isValidGtin('04780069000131')).toBe(false);
    expect(isValidGtin('12345')).toBe(false);
  });
  it('shtrix-kod ko\'rinishlari', () => {
    expect(gtinBarcodes(GTIN)).toEqual([GTIN, '4780069000130']);
    expect(gtinBarcodes('00000040123455')).toEqual(['00000040123455', '0000040123455', '000040123455', '40123455']);
    expect(gtinToBarcode(GTIN)).toBe('4780069000130');
    expect(gtinToBarcode('14780069000137')).toBe('14780069000137');
  });
});

describe('parseGs1 — markirovka kodlari', () => {
  it('suv/pivo: 01 + 21 + GS + 93', () => {
    const c = parseGs1(`01${GTIN}21ABC123${GS}93XyZ1`, NOW)!;
    expect(c).toMatchObject({ gtin: GTIN, serial: 'ABC123', guessed: false, format: 'gs1', key: `01${GTIN}21ABC123` });
    expect(c.elements).toEqual([{ ai: '01', value: GTIN }, { ai: '21', value: 'ABC123' }, { ai: '93', value: 'XyZ1' }]);
    expect(c.normalized).toBe(`01${GTIN}21ABC123${GS}93XyZ1`);
    expect(isMarkingCode(c)).toBe(true);
  });

  it('GS tushib qolgan (USB skaner) — seriya chegarasi taxmin qilinadi, kanonik ko\'rinish bir xil', () => {
    const withGs = parseGs1(`01${GTIN}21ABC123${GS}93XyZ1`, NOW)!;
    const noGs = parseGs1(`01${GTIN}21ABC12393XyZ1`, NOW)!;
    expect(noGs.serial).toBe('ABC123');
    expect(noGs.guessed).toBe(true);
    expect(noGs.normalized).toBe(withGs.normalized);
    expect(noGs.key).toBe(withGs.key);
  });

  it('dori/texnika: 21 + GS + 91 (4) + GS + 92 (44)', () => {
    const raw = `01${GTIN}21SERIAL0000001${GS}91EE07${GS}92${CRYPTO44}`;
    const c = parseGs1(raw, NOW)!;
    expect(c.serial).toBe('SERIAL0000001');
    expect(c.elements.map((e) => e.ai)).toEqual(['01', '21', '91', '92']);
    expect(c.elements[2].value).toBe('EE07');
    expect(c.elements[3].value).toBe(CRYPTO44);
    // GS umuman yo'q
    const bare = parseGs1(`01${GTIN}21SERIAL000000191EE0792${CRYPTO44}`, NOW)!;
    expect(bare.serial).toBe('SERIAL0000001');
    expect(bare.guessed).toBe(true);
    expect(bare.normalized).toBe(c.normalized);
    // Faqat (91) dan keyingi GS tushgan
    const half = parseGs1(`01${GTIN}21SERIAL0000001${GS}91EE0792${CRYPTO44}`, NOW)!;
    expect(half.elements[2].value).toBe('EE07');
    expect(half.normalized).toBe(c.normalized);
  });

  it('yaroqlilik (17) va partiya (10)', () => {
    const c = parseGs1(`01${GTIN}1727033110LOT-7${GS}21XYZ`, NOW)!;
    expect(c.expiry).toBe('2027-03-31');
    expect(c.batch).toBe('LOT-7');
    expect(c.serial).toBe('XYZ');
    // DD = 00 — oy oxiri
    expect(parseGs1(`01${GTIN}1726020021A`, NOW)!.expiry).toBe('2026-02-28');
  });

  it('simbologiya belgisi, boshidagi FNC1 va matnli GS ko\'rinishlari', () => {
    const base = `01${GTIN}21ABC123${GS}93XyZ1`;
    for (const raw of [
      `]d2${base}`, `]C1${base}`, `]Q3${base}`, `${GS}${base}`, ` ${base}\r\n`,
      `01${GTIN}21ABC123<GS>93XyZ1`, `01${GTIN}21ABC123{GS}93XyZ1`, `01${GTIN}21ABC123␝93XyZ1`, `01${GTIN}21ABC123^]93XyZ1`,
    ]) {
      const c = parseGs1(raw, NOW);
      expect(c?.normalized, raw).toBe(base);
    }
  });

  it('qavsli ko\'rinish (yorliqdagi matn)', () => {
    const c = parseGs1(`(01)${GTIN}(21)ABC123(93)XyZ1`, NOW)!;
    expect(c.normalized).toBe(`01${GTIN}21ABC123${GS}93XyZ1`);
    expect(parseGs1(`(01) ${GTIN} (21) ABC123 (17) 270331`, NOW)!).toMatchObject({ serial: 'ABC123', expiry: '2027-03-31' });
  });

  it('rus klaviatura tartibida yozilgan kod', () => {
    // «ABC123» rus tartibida yozilsa: Shift+A → «Ф», Shift+B → «И», Shift+C → «С»
    expect(fixKeyboardLayout('ФИС123')).toBe('ABC123');
    const c = parseGs1(`01${GTIN}21ФИС12393ЧнЯ1`, NOW)!;
    expect(c.serial).toBe('ABC123');
    expect(c.elements[2].value).toBe('XyZ1');
  });

  it('qisqa format (sigaret qutisi, AI\'siz 29 belgi)', () => {
    const c = parseGs1('04600266011725Ab-1a7v8AAAA7Tf', NOW)!;
    expect(c).toMatchObject({ gtin: '04600266011725', serial: 'Ab-1a7v', format: 'short' });
    expect(isMarkingCode(c)).toBe(true);
  });

  it('kod emas — null', () => {
    expect(parseGs1('4780069000130')).toBeNull(); // oddiy EAN-13
    expect(parseGs1('')).toBeNull();
    expect(parseGs1('SVR-ABC-123')).toBeNull();
    expect(parseGs1(`01${GTIN.slice(0, 13)}1` + '21ABC')).toBeNull(); // GTIN nazorat raqami xato
    expect(parseGs1('01478006900')).toBeNull(); // qisqa
  });

  it('seriyasiz GS1 kod — markirovka kodi emas', () => {
    const c = parseGs1(`01${GTIN}17270331`, NOW);
    expect(c?.gtin).toBe(GTIN);
    expect(isMarkingCode(c)).toBe(false);
    expect(c?.key).toBeNull();
  });
});

describe('yordamchilar', () => {
  it('cleanScan', () => {
    expect(cleanScan(`]d2${GS}01${GTIN}${GS}`)).toBe(`01${GTIN}`);
  });
  it('gs1Date: asr qoidasi', () => {
    expect(gs1Date('991231', NOW)).toBe('1999-12-31');
    expect(gs1Date('270101', NOW)).toBe('2027-01-01');
    expect(gs1Date('761231', NOW)).toBe('2076-12-31');
    expect(gs1Date('771231', NOW)).toBe('1977-12-31');
    expect(gs1Date('271301', NOW)).toBeNull();
    expect(gs1Date('270231', NOW)).toBeNull();
  });
  it('muddat', () => {
    expect(isExpiredOn('2026-11-17', '2026-11-18')).toBe(true);
    expect(isExpiredOn('2026-11-18', '2026-11-18')).toBe(false);
    expect(isExpiredOn(undefined, '2026-11-18')).toBe(false);
    expect(localDateKey(NOW)).toBe('2026-11-18');
  });
  it('scanToBarcode va markingLabel', () => {
    expect(scanToBarcode(`01${GTIN}21ABC123${GS}93XyZ1`)).toBe('4780069000130');
    expect(scanToBarcode(' 4780069000130 ')).toBe('4780069000130');
    expect(markingLabel(`01${GTIN}21ABC123${GS}93XyZ1`)).toBe('ABC123');
  });
});

describe('mobil nusxa', () => {
  it('mobile/lib/gs1.ts web/lib/gs1.ts bilan aynan bir xil', () => {
    const web = readFileSync(path.resolve(__dirname, '../lib/gs1.ts'), 'utf8');
    const mobile = readFileSync(path.resolve(__dirname, '../../mobile/lib/gs1.ts'), 'utf8');
    expect(mobile).toBe(web);
  });
});
