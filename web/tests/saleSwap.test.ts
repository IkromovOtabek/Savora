/**
 * Sotuvda tovarni almashtirish (lib/saleEditOps, input.product) — haqiqiy MongoDB bilan:
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/saleSwap.test.ts
 * Ombor (eski qaytadi, yangi ayriladi), pul (hozir to'lov / qarzga / qaytarish), bank ulushi, nasiya, cheklovlar.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';

vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));

const URI = process.env.MONGO_TEST_URI;

describe.skipIf(!URI)('editSale — tovar almashtirish (MongoDB)', () => {
  let conn: mongoose.Connection;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any;
  let editSale: typeof import('@/lib/saleEditOps').editSale;
  const branchA = new Types.ObjectId();
  const branchB = new Types.ObjectId();
  const admin = { id: 'a', username: 'egasi', role: 'admin' as const, tokenVersion: 1, dbName: 'test' };
  let n = 0;

  const product = (over: Record<string, unknown> = {}) => m.Product.create({
    name: `Tovar ${++n}`, imei: `IMEI${n}`, branchId: branchA, salePrice: 100_000, purchasePrice: 60_000, status: 'in_stock', ...over,
  });
  const sale = async (p: { _id: Types.ObjectId; name: string }, over: Record<string, unknown> = {}) => {
    await m.Product.updateOne({ _id: p._id }, { $set: { status: 'sold' } });
    return m.Sale.create({
      saleNo: `S-${++n}`, productId: p._id, productSnapshot: { name: p.name, imei: `X${n}`, purchasePrice: 60_000, saleQuantity: 1 },
      branchId: branchA, paymentType: 'cash', totalAmount: 100_000, paidAmount: 100_000, remainingAmount: 0, status: 'paid',
      payments: [{ amount: 100_000, paidAt: new Date(), method: 'cash' }], soldBy: 'ali', ...over,
    });
  };

  beforeAll(async () => {
    conn = await mongoose.createConnection(`${URI}/savora_saleswap_test_${Date.now()}`).asPromise();
    m = {
      Sale: conn.model('Sale', (await import('@/lib/models/tenant/Sale')).saleSchema),
      Customer: conn.model('Customer', (await import('@/lib/models/tenant/Customer')).customerSchema),
      Product: conn.model('Product', (await import('@/lib/models/tenant/Product')).productSchema),
      ShopSettings: conn.model('ShopSettings', (await import('@/lib/models/tenant/ShopSettings')).shopSettingsSchema),
    };
    await Promise.all(Object.values(m).map((M) => (M as mongoose.Model<unknown>).init()));
    editSale = (await import('@/lib/saleEditOps')).editSale;
  });
  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  it("naqd, qimmatroq, hozir to'laydi: ombor almashadi, to'lov yoziladi", async () => {
    const oldP = await product();
    const newP = await product({ salePrice: 130_000, purchasePrice: 90_000 });
    const s = await sale(oldP);
    const r = await editSale(m, admin, String(s._id), { product: { id: String(newP._id), settle: 'now', method: 'uzcard' } }, { canEditPrice: false });
    expect(r.ok && r.swap).toMatchObject({ collectNow: 30_000, refundAmount: 0 });
    const after = await m.Sale.findById(s._id).lean();
    expect(String(after.productId)).toBe(String(newP._id));
    expect(after.productSnapshot).toMatchObject({ name: newP.name, purchasePrice: 90_000, saleQuantity: 1 });
    expect(after).toMatchObject({ totalAmount: 130_000, paidAmount: 130_000, remainingAmount: 0, status: 'paid' });
    expect(after.payments.at(-1)).toMatchObject({ amount: 30_000, method: 'uzcard', note: 'Tovar almashtirildi — farq' });
    expect(after.edits[0].changes.map((c: { field: string }) => c.field)).toEqual(['product', 'totalAmount']);
    expect((await m.Product.findById(oldP._id).lean()).status).toBe('in_stock');
    expect((await m.Product.findById(newP._id).lean()).status).toBe('sold');
  });

  it('naqd, arzonroq: ortig\'i qaytarish yozuvi bilan', async () => {
    const s = await sale(await product());
    const cheap = await product({ salePrice: 70_000 });
    const r = await editSale(m, admin, String(s._id), { product: { id: String(cheap._id), settle: 'now' } }, { canEditPrice: false });
    expect(r.ok).toBe(true);
    const after = await m.Sale.findById(s._id).lean();
    expect(after).toMatchObject({ totalAmount: 70_000, paidAmount: 70_000, status: 'paid' });
    expect(after.returns[0]).toMatchObject({ kind: 'price', amount: 30_000, refundAmount: 30_000, debtReduced: 0 });
  });

  it("qarzga yozish: qoldiq paydo bo'ladi (mijoz bor)", async () => {
    const s = await sale(await product(), { customerSnapshot: { fullName: 'Ali', phone: '+998901111111' } });
    const p2 = await product({ salePrice: 150_000 });
    const r = await editSale(m, admin, String(s._id), { product: { id: String(p2._id), settle: 'debt' } }, { canEditPrice: false });
    expect(r.ok).toBe(true);
    expect(await m.Sale.findById(s._id).lean()).toMatchObject({ totalAmount: 150_000, paidAmount: 100_000, remainingAmount: 50_000, status: 'partial' });
  });

  it("sof bank krediti: bank ulushi qoladi, farq faqat hozir to'lanadi", async () => {
    const s = await sale(await product(), {
      paymentType: 'bank_credit', paidAmount: 20_000, remainingAmount: 80_000, status: 'partial',
      bankParts: [{ bankName: 'Ipak', amount: 80_000 }], payments: [{ amount: 20_000, paidAt: new Date() }],
      customerSnapshot: { fullName: 'Ali', phone: '+998901111111' },
    });
    const p2 = await product({ salePrice: 120_000 });
    const r = await editSale(m, admin, String(s._id), { product: { id: String(p2._id), settle: 'debt' } }, { canEditPrice: false });
    expect(r.ok && r.swap).toMatchObject({ collectNow: 20_000, addedToDebt: 0 });
    expect(await m.Sale.findById(s._id).lean()).toMatchObject({ totalAmount: 120_000, paidAmount: 40_000, remainingAmount: 80_000 });
    const tooCheap = await product({ salePrice: 50_000 });
    expect(await editSale(m, admin, String(s._id), { product: { id: String(tooCheap._id), settle: 'now' } }, { canEditPrice: false }))
      .toEqual({ ok: false, error: 'belowBank' });
    // Rad etilganda yangi tovar omborda qoladi
    expect((await m.Product.findById(tooCheap._id).lean()).status).toBe('in_stock');
  });

  it("nasiya, hozir to'laydi: boshlang'ich oshadi, oylar o'zgarmaydi", async () => {
    const s = await sale(await product(), {
      paymentType: 'installment', installmentMonths: 2, downPayment: 20_000, paidAmount: 20_000, remainingAmount: 80_000, status: 'partial',
      payments: [{ amount: 20_000, paidAt: new Date() }], customerSnapshot: { fullName: 'Ali', phone: '+998901111111' },
    });
    const p2 = await product({ salePrice: 110_000 });
    const r = await editSale(m, admin, String(s._id), { product: { id: String(p2._id), settle: 'now' } }, { canEditPrice: false });
    expect(r.ok).toBe(true);
    const after = await m.Sale.findById(s._id).lean();
    expect(after).toMatchObject({ totalAmount: 110_000, paidAmount: 30_000, remainingAmount: 80_000, downPayment: 30_000 });
    expect(after.installmentAmounts).toBeUndefined();
  });

  it("narx qo'lda: huquqsiz rad, huquq bilan — shu summa", async () => {
    const s = await sale(await product());
    const p2 = await product({ salePrice: 100_000 });
    expect(await editSale(m, admin, String(s._id), { product: { id: String(p2._id), settle: 'now' }, totalAmount: 90_000 }, { canEditPrice: false }))
      .toEqual({ ok: false, error: 'pricePerm' });
    const r = await editSale(m, admin, String(s._id), { product: { id: String(p2._id), settle: 'now' }, totalAmount: 90_000 }, { canEditPrice: true });
    expect(r.ok && r.swap?.refundAmount).toBe(10_000);
  });

  it("cheklovlar: o'zi, boshqa filial, sotilgan, markirovka kodli sotuv", async () => {
    const p1 = await product();
    const s = await sale(p1);
    const args = (id: unknown) => ({ product: { id: String(id), settle: 'now' as const } });
    expect(await editSale(m, admin, String(s._id), args(p1._id), { canEditPrice: false })).toEqual({ ok: false, error: 'swapSame' });
    const other = await product({ branchId: branchB });
    expect(await editSale(m, admin, String(s._id), args(other._id), { canEditPrice: false })).toEqual({ ok: false, error: 'swapNotInStock' });
    const sold = await product({ status: 'sold' });
    expect(await editSale(m, admin, String(s._id), args(sold._id), { canEditPrice: false })).toEqual({ ok: false, error: 'swapNotInStock' });
    const marked = await sale(await product(), { markingCodes: ['x'], markingKeys: [`k${n}`] });
    const p3 = await product();
    expect(await editSale(m, admin, String(marked._id), args(p3._id), { canEditPrice: false })).toEqual({ ok: false, error: 'swapMarked' });
  });

  it('miqdorli tovar: shu miqdorda ayriladi va qaytadi', async () => {
    const oldP = await product({ trackQuantity: true, quantity: 10, soldQuantity: 3, unit: 'dona', salePrice: 10_000 });
    const s = await sale(oldP, { productSnapshot: { name: oldP.name, imei: 'Q1', saleQuantity: 3, unit: 'dona' }, totalAmount: 30_000, paidAmount: 30_000 });
    await m.Product.updateOne({ _id: oldP._id }, { $set: { status: 'in_stock' } });
    const newP = await product({ trackQuantity: true, quantity: 5, soldQuantity: 0, unit: 'dona', salePrice: 12_000 });
    const r = await editSale(m, admin, String(s._id), { product: { id: String(newP._id), settle: 'now' } }, { canEditPrice: false });
    expect(r.ok && r.swap?.collectNow).toBe(6_000);
    expect((await m.Product.findById(oldP._id).lean()).soldQuantity).toBe(0);
    expect((await m.Product.findById(newP._id).lean()).soldQuantity).toBe(3);
  });
});
