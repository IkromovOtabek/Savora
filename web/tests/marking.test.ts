import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { GS } from '@/lib/gs1';
import { checkMarkingLines, markingModeOf, markingNeed, markingShortfall, productMatchesGtin, serialOfKey, soldMarkingConflict } from '@/lib/marking';

const GTIN = '04780069000130';
const EAN = '4780069000130';
const code = (serial: string, extra = `${GS}93XyZ1`) => `01${GTIN}21${serial}${extra}`;
const TODAY = '2026-11-18';
const line = (over: Partial<Parameters<typeof checkMarkingLines>[0][number]> = {}) => ({
  name: 'Suv 1,5 l', qty: 2, unit: 'dona', marked: true, productCodes: [EAN, 'SKU-1'], codes: [code('AAA111'), code('BBB222')], ...over,
});

describe('markirovka qoidalari', () => {
  it('rejim', () => {
    expect(markingModeOf('require')).toBe('require');
    expect(markingModeOf(undefined)).toBe('warn');
    expect(markingModeOf('x')).toBe('warn');
  });

  it('GTIN ↔ mahsulot shtrix-kodi', () => {
    expect(productMatchesGtin([EAN], GTIN)).toBe(true);
    expect(productMatchesGtin([GTIN], GTIN)).toBe(true);
    expect(productMatchesGtin(['4780069000147', null], GTIN)).toBe(false);
  });

  it('kerakli kodlar soni', () => {
    expect(markingNeed(3, 'dona')).toBe(3);
    expect(markingNeed(1.5, 'kg')).toBe(1);
    expect(markingShortfall(3, 'dona', 1)).toBe(2);
    expect(markingShortfall(1, null, 4)).toBe(0);
  });

  it('to\'g\'ri savatcha — kanonik kod va kalitlar', () => {
    const r = checkMarkingLines([line({ codes: [code('AAA111'), `01${GTIN}21BBB22293XyZ1`] })], 'require', TODAY);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lines[0].keys).toEqual([`01${GTIN}21AAA111`, `01${GTIN}21BBB222`]);
      expect(r.lines[0].codes[1]).toBe(code('BBB222'));
    }
  });

  it('xatolar: format, boshqa tovar, takror, ortiqcha', () => {
    expect(checkMarkingLines([line({ codes: ['4780069000130', code('B')] })], 'warn', TODAY)).toMatchObject({ ok: false, error: { code: 'invalid' } });
    expect(checkMarkingLines([line({ productCodes: ['4780069000147'] })], 'warn', TODAY)).toMatchObject({ ok: false, error: { code: 'mismatch', value: 'AAA111' } });
    expect(checkMarkingLines([line({ codes: [code('AAA111'), `01${GTIN}21AAA11193Oth1`] })], 'warn', TODAY)).toMatchObject({ ok: false, error: { code: 'duplicate' } });
    expect(checkMarkingLines([line({ qty: 1 })], 'warn', TODAY)).toMatchObject({ ok: false, error: { code: 'tooMany' } });
    // Ikki qator orasida takror
    expect(checkMarkingLines([line({ qty: 1, codes: [code('Q1')] }), line({ qty: 1, codes: [code('Q1')] })], 'warn', TODAY))
      .toMatchObject({ ok: false, error: { code: 'duplicate' } });
  });

  it('require: yetishmagan kod va muddati o\'tgan; warn — o\'tkaziladi', () => {
    expect(checkMarkingLines([line({ qty: 3 })], 'require', TODAY)).toMatchObject({ ok: false, error: { code: 'missing', n: 1 } });
    expect(checkMarkingLines([line({ qty: 3 })], 'warn', TODAY).ok).toBe(true);
    // Markirovkasiz tovar — kodsiz ham
    expect(checkMarkingLines([line({ marked: false, codes: [] })], 'require', TODAY).ok).toBe(true);
    const expired = line({ qty: 1, codes: [`01${GTIN}1726103121EXP1${GS}93XyZ1`] });
    expect(checkMarkingLines([expired], 'require', TODAY)).toMatchObject({ ok: false, error: { code: 'expired', date: '2026-10-31' } });
    expect(checkMarkingLines([expired], 'warn', TODAY).ok).toBe(true);
  });

  it('bazadagi sotuv bilan to\'qnashuv', () => {
    const key = `01${GTIN}21AAA111`;
    expect(soldMarkingConflict([key], [{ markingKeys: [key], status: 'paid' }])).toBe(key);
    expect(soldMarkingConflict([key], [{ markingKeys: [key], status: 'cancelled' }])).toBeNull();
    expect(soldMarkingConflict([key], [{ markingKeys: [key], status: 'paid', returns: [{}] }])).toBeNull();
    // Narx tuzatilishi — tovar qaytmagan, kod hali sotilgan
    expect(soldMarkingConflict([key], [{ markingKeys: [key], status: 'paid', returns: [{ kind: 'price' }] }])).toBe(key);
    expect(serialOfKey(key)).toBe('AAA111');
  });
});

/**
 * Sale sxemasi va takror so'rovi — haqiqiy MongoDB bilan (posSaleAction'dagi so'rov bilan bir xil):
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/marking.test.ts
 */
describe.skipIf(!process.env.MONGO_TEST_URI)('Sale.markingCodes (MongoDB)', () => {
  let conn: mongoose.Connection;
  let Sale: mongoose.Model<import('@/lib/models/tenant/Sale').ISale>;

  beforeAll(async () => {
    conn = await mongoose.createConnection(`${process.env.MONGO_TEST_URI}/savora_marking_test_${Date.now()}`).asPromise();
    const { saleSchema } = await import('@/lib/models/tenant/Sale');
    Sale = conn.model('Sale', saleSchema);
    await Sale.init();
  });
  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  const saleDoc = (no: string, keys: string[], over: Record<string, unknown> = {}) => ({
    saleNo: no, productId: new Types.ObjectId(), branchId: new Types.ObjectId(), paymentType: 'cash', totalAmount: 1, paidAmount: 1,
    remainingAmount: 0, soldBy: 'ali', productSnapshot: { name: 'Suv', imei: EAN, ikpu: '00901001001048019' },
    markingCodes: keys.map((k) => `${k}${GS}93XyZ1`), markingKeys: keys, ...over,
  });
  const conflictFor = async (keys: string[]) =>
    soldMarkingConflict(keys, await Sale.find({ markingKeys: { $in: keys }, status: { $ne: 'cancelled' } }).select('markingKeys returns status').lean());

  it('saqlanadi (GS bilan), indeks bor; faol sotuvdagi kod — takror, bekor qilingani — yo\'q', async () => {
    const k1 = `01${GTIN}21AAA111`;
    const k2 = `01${GTIN}21BBB222`;
    await Sale.create(saleDoc('S-1', [k1]));
    await Sale.create(saleDoc('S-2', [k2], { status: 'cancelled' }));
    const saved = await Sale.findOne({ saleNo: 'S-1' }).lean();
    expect(saved?.markingCodes?.[0]).toBe(`${k1}${GS}93XyZ1`);
    expect(saved?.productSnapshot.ikpu).toBe('00901001001048019');
    const indexes = await Sale.collection.indexes();
    expect(indexes.some((i) => i.key.markingKeys === 1)).toBe(true);
    expect(await conflictFor([k1])).toBe(k1);
    expect(await conflictFor([k2])).toBeNull();
    // Markirovkasiz eski sotuvlar so'rovga tushmaydi
    await Sale.create(saleDoc('S-3', [], { markingCodes: undefined, markingKeys: undefined }));
    expect(await conflictFor([`01${GTIN}21CCC333`])).toBeNull();
  });
});
