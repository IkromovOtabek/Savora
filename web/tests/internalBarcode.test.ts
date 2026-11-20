/**
 * Do'kon ichki barkodi (lib/labels/internalBarcode.ts): EAN-13 nazorat raqami, «200» prefiksi, umumiy barkod
 * lug'atiga tushmasligi va band kodni chetlab o'tish.
 */
import { describe, it, expect, vi } from 'vitest';
import { ean13CheckDigit, INTERNAL_BARCODE_PREFIX, isInternalBarcode, makeInternalBarcode, uniqueInternalBarcode } from '@/lib/labels/internalBarcode';
import { hasValidGtinCheckDigit, isSharedBarcode } from '@/lib/barcodeLookup';
import { labelCodeOf } from '@/lib/labels/settings';

describe('ichki barkod', () => {
  it('EAN-13 nazorat raqami (ma\'lum kodlar)', () => {
    expect(ean13CheckDigit('400638133393')).toBe(1); // 4006381333931
    expect(ean13CheckDigit('590123412345')).toBe(7); // 5901234123457
    expect(ean13CheckDigit('200000000000')).toBe(8);
  });
  it('yaratilgan kod: 13 raqam, «200», nazorat raqami to\'g\'ri; umumiy lug\'atga tushmaydi', () => {
    let n = 0;
    const code = makeInternalBarcode(() => (n++ % 10));
    expect(code).toBe(`${INTERNAL_BARCODE_PREFIX}012345678` + ean13CheckDigit('200012345678'));
    expect(code).toHaveLength(13);
    expect(isInternalBarcode(code)).toBe(true);
    expect(hasValidGtinCheckDigit(code)).toBe(true);
    expect(isSharedBarcode(code)).toBe(false);
    for (let i = 0; i < 50; i++) expect(isInternalBarcode(makeInternalBarcode())).toBe(true);
    expect(isInternalBarcode('4006381333931')).toBe(false); // zavod kodi
    expect(isInternalBarcode('2000123456780')).toBe(false); // nazorat raqami noto'g'ri
  });
  it('band kod chetlab o\'tiladi; yorliqqa barkod chiqadi', async () => {
    const exists = vi.fn().mockResolvedValueOnce({ _id: 'x' }).mockResolvedValueOnce(null);
    const code = await uniqueInternalBarcode({ exists });
    expect(exists).toHaveBeenCalledTimes(2);
    expect(exists.mock.calls[1][0]).toEqual({ $or: [{ barcode: code }, { imei: code }] });
    expect(isInternalBarcode(code)).toBe(true);
    expect(labelCodeOf({ barcode: code, productId: 'PRD-1', kind: 'goods' }, false)).toEqual({ code, codeKind: 'barcode' });
    await expect(uniqueInternalBarcode({ exists: async () => ({ _id: 'x' }) })).rejects.toThrow();
  });
});
