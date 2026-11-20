import { describe, expect, it } from 'vitest';
import BitArray from '@zxing/library/esm/core/common/BitArray';
import Code128Reader from '@zxing/library/esm/core/oned/Code128Reader';
import { CODE128_PATTERNS, code128Bars, code128Values, code128Widths } from '@/lib/labels/code128';
import { codeMatches, scanVariants } from '@/lib/scanCode';
import { expandCopies, labelDocument, labelGeometry } from '@/lib/labels/render';
import { labelCodeOf, resolveLabelSettings, type LabelItem } from '@/lib/labels/settings';

/** Shtrix-kodni piksel qatoriga aylantirib, ZXing (kamera skaneri ishlatadigan dekoder) bilan o'qiydi */
function decode(text: string, px = 2): string {
  const bars = code128Bars(text);
  if (!bars) throw new Error('encode failed');
  const quiet = 12;
  const row = new BitArray((bars.modules + quiet * 2) * px);
  for (const [x, w] of bars.bars) {
    for (let i = (quiet + x) * px; i < (quiet + x + w) * px; i++) row.set(i);
  }
  return new Code128Reader().decodeRow(0, row, new Map()).getText();
}

describe('Code 128', () => {
  it('jadval: har belgi 11 modul, STOP 13, hammasi noyob', () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    CODE128_PATTERNS.forEach((p, i) => {
      const sum = [...p].reduce((a, c) => a + Number(c), 0);
      expect(sum, `qiymat ${i}`).toBe(i === 106 ? 13 : 11);
    });
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
  });

  it.each([
    '356938035643809', // IMEI (15 raqam, toq)
    '35693803564380', // 14 raqam
    '4780000000007', // EAN-13
    'PRD-5K2ABCD',
    'SKU-MHX1Z2Q9AB12',
    'A1',
    '7',
    'ab12345678cd',
    'X-1234-Y',
    '00',
    'Hello World!',
  ])('ZXing o\'qiydi: %s', (code) => {
    expect(decode(code)).toBe(code);
    expect(decode(code, 3)).toBe(code);
  });

  it('IMEI ixcham: 134 modul (40 mm yorliqqa 0.25 mm chiziq bilan sig\'adi)', () => {
    expect(code128Bars('356938035643809')!.modules).toBe(134);
    // START + 1 raqam (B) + CODE C + 7 juft + nazorat = 11 belgi
    expect(code128Values('356938035643809')).toHaveLength(11);
  });

  it('kodlab bo\'lmaydigan matn — null', () => {
    expect(code128Widths('')).toBeNull();
    expect(code128Widths('Телефон')).toBeNull();
    expect(code128Widths('x'.repeat(49))).toBeNull();
  });
});

describe('skaner: klaviatura tartibi', () => {
  it('kirill tartibida yozilgan kod lotinga qaytadi', () => {
    // RUS tartibda Shift+P,R,D → «ЗКВ»
    expect(scanVariants('ЗКВ-5Л2')).toEqual(['ЗКВ-5Л2', 'PRD-5K2']);
    expect(scanVariants(' 3569 3803 ')).toEqual(['35693803']);
    expect(codeMatches(['356938035643809', 'PRD-5K2'], 'ЗКВ-5Л2')).toBe(true);
    expect(codeMatches(['PRD-5K2'], 'prd-5k2')).toBe(true);
    expect(codeMatches(['PRD-5K2'], 'PRD-5K3')).toBe(false);
    expect(codeMatches(['PRD-5K2'], '')).toBe(false);
  });
});

describe('yorliq sozlamalari va chizish', () => {
  const item = (o: Partial<LabelItem> = {}): LabelItem => ({
    id: '1', name: 'Galaxy A15', code: '356938035643809', codeKind: 'imei', price: 1_850_000, available: 1, ...o,
  });
  const ctx = { shopName: 'Mobi <Shop>', texts: { sum: "so'm", warranty: 'Kafolat: {n} oy' } };

  it('sukut: telefon do\'koni — avto-chop etish yoqiq, chegaralar', () => {
    expect(resolveLabelSettings(null, true).autoPrint).toBe(true);
    expect(resolveLabelSettings(null, false).autoPrint).toBe(false);
    const s = resolveLabelSettings({ width: 500, height: 2, copies: 0, fields: ['price', 'name', 'bad' as never], textSize: 'xl' as never }, true);
    expect(s).toMatchObject({ width: 100, height: 15, copies: 1, fields: ['name', 'price'], textSize: 'm' });
  });

  it('barkod qiymati: telefon — IMEI, IMEI yo\'q — ID, aks holda shtrix-kod', () => {
    expect(labelCodeOf({ imei: '356938035643809', productId: 'PRD-1' }, true)).toEqual({ code: '356938035643809', codeKind: 'imei' });
    expect(labelCodeOf({ imei: 'SKU-X', imeiPending: true, productId: 'PRD-1' }, true)).toEqual({ code: 'PRD-1', codeKind: 'productId' });
    expect(labelCodeOf({ imei: '4780000000007', barcode: '4780000000007', productId: 'PRD-1' }, false)).toEqual({ code: '4780000000007', codeKind: 'barcode' });
    expect(labelCodeOf({ imei: 'SKU-X', productId: 'PRD-1' }, false)).toEqual({ code: 'PRD-1', codeKind: 'productId' });
  });

  it('IMEI 40 mm yorliqda — 0.25 mm chiziq (203 dpi: 2 nuqta), 30 mm da — zich', () => {
    const g40 = labelGeometry('356938035643809', 40)!;
    expect(g40.moduleMm).toBe(0.25);
    expect(g40.tight).toBe(false);
    expect(g40.widthMm).toBeLessThanOrEqual(40 - 3);
    expect(labelGeometry('356938035643809', 30)!.tight).toBe(true);
    expect(labelGeometry('356938035643809', 58)!.moduleMm % 0.125).toBe(0);
    expect(labelGeometry('Телефон', 40)).toBeNull();
  });

  it('hujjat: @page o\'lchami, har yorliq alohida, matn ekranlanadi', () => {
    const s = resolveLabelSettings({ fields: ['shop', 'name', 'code', 'price', 'warranty'] }, true);
    const html = labelDocument([item({ name: '<img src=x onerror=alert(1)>', warrantyMonths: 12 }), item()], s, ctx);
    expect(html).toContain('@page{size:40mm 30mm;margin:0}');
    expect(html.match(/class="l"/g)).toHaveLength(2);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x');
    expect(html).toContain('Mobi &lt;Shop&gt;');
    expect(html).toContain('IMEI 356938035643809');
    expect(html).toContain('Kafolat: 12 oy');
    expect(html).toContain('1\u00a0850\u00a0000'); // fmtMoney — uzluksiz bo'shliq
    expect(html).not.toContain('<script');
  });

  it('nusxalar: har tovarga N ta yoki qoldiq soniga teng, umumiy cheklov', () => {
    const items = [item({ id: 'a', available: 3 }), item({ id: 'b', available: 0 })];
    expect(expandCopies(items, 2, false).map((i) => i.id)).toEqual(['a', 'a', 'b', 'b']);
    expect(expandCopies(items, 2, true).map((i) => i.id)).toEqual(['a', 'a', 'a', 'b']);
    expect(expandCopies([item({ available: 5000 })], 1, true)).toHaveLength(1000);
  });
});
