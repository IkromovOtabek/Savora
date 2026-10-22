/**
 * Xizmat va to'plam: sotuvda ombor harakati.
 * Sof qoidalar doim; atomik yangilashlar — MONGO_TEST_URI bilan:
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/productKinds.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { checkSaleQty, clampQtyToStock, getStockQty, isStockless } from '@/lib/productQuantity';

const URI = process.env.MONGO_TEST_URI;

describe('xizmat/to\'plam — sof qoidalar', () => {
  const base = { trackQuantity: false, quantity: 1, soldQuantity: 0, status: 'in_stock' as const };
  it('o\'z qoldig\'i yo\'q (hisobotlarda 0)', () => {
    expect(isStockless({ kind: 'service' })).toBe(true);
    expect(isStockless({ kind: 'bundle' })).toBe(true);
    expect(isStockless({ kind: 'goods' })).toBe(false);
    expect(isStockless({})).toBe(false);
    expect(getStockQty({ ...base, kind: 'service' })).toBe(0);
    expect(getStockQty({ ...base, kind: 'bundle' })).toBe(0);
  });
  it('xizmat — istalgan miqdor (birlikka mos), to\'plam — butun', () => {
    expect(checkSaleQty({ ...base, kind: 'service' }, 5)).toEqual({ ok: true, qty: 5 });
    expect(checkSaleQty({ ...base, kind: 'service', unit: 'kg' }, 1.5)).toEqual({ ok: true, qty: 1.5 });
    expect(checkSaleQty({ ...base, kind: 'bundle' }, 3)).toEqual({ ok: true, qty: 3 });
    expect(checkSaleQty({ ...base, kind: 'bundle' }, 1.5).ok).toBe(false);
    expect(checkSaleQty({ ...base, kind: 'service' }, null).ok).toBe(false);
  });
  it('ko\'chirib bo\'lmaydi', () => {
    expect(clampQtyToStock({ ...base, kind: 'service' }, 1)).toEqual({ ok: false, reason: 'noStock' });
  });
});

describe.skipIf(!URI)('xizmat/to\'plam — atomik ombor (MongoDB)', () => {
  let conn: mongoose.Connection;
  let Product: mongoose.Model<import('@/lib/models/tenant/Product').IProduct>;
  let stock: typeof import('@/lib/stock');
  const branchId = new Types.ObjectId();
  const otherBranch = new Types.ObjectId();
  const code = () => `K${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    conn = await mongoose.createConnection(`${URI}/savora_kinds_test_${Date.now()}`).asPromise();
    const { productSchema } = await import('@/lib/models/tenant/Product');
    Product = conn.model('Product', productSchema);
    await Product.init();
    stock = await import('@/lib/stock');
  });
  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  const goods = (qty: number, over: Record<string, unknown> = {}) => Product.create({
    name: 'Choy', imei: code(), purchasePrice: 1000, salePrice: 2000, trackQuantity: true, quantity: qty,
    soldQuantity: 0, status: 'in_stock', branchId, ...over,
  });

  it('xizmat: sotilsa ham, qaytarilsa ham ombor va holat o\'zgarmaydi', async () => {
    const s = await Product.create({ name: 'Yetkazish', imei: code(), kind: 'service', purchasePrice: 0, salePrice: 15000, status: 'in_stock', branchId });
    for (let i = 0; i < 3; i++) expect(await stock.reserveStock(Product, s._id, 2, { history: { action: 'sold', detail: '2', by: 'a', at: new Date() } })).not.toBeNull();
    let after = await Product.findById(s._id).lean();
    expect(after?.status).toBe('in_stock');
    expect(after?.soldQuantity).toBe(0);
    expect(after?.history?.length).toBe(3);
    await stock.releaseStock(Product, s._id, 2);
    after = await Product.findById(s._id).lean();
    expect(after?.status).toBe('in_stock');
  });

  it('xizmatni ko\'chirib bo\'lmaydi', async () => {
    const s = await Product.create({ name: 'Ta\'mir', imei: code(), kind: 'service', purchasePrice: 0, salePrice: 1, status: 'in_stock', branchId });
    const moved = await stock.transferStock(Product, s._id, otherBranch, 1, { trackQuantity: false, history: { action: 'transferred', detail: '', by: 'a', at: new Date() } });
    expect(moved).toBeNull();
  });

  it('to\'plam: tarkib ayriladi, qaytarishda qaytadi', async () => {
    const tea = await goods(10);
    const sugar = await goods(5);
    const b = await Product.create({
      name: 'Nonushta', imei: code(), kind: 'bundle', purchasePrice: 3000, salePrice: 5000, status: 'in_stock', branchId,
      bundleItems: [{ productId: tea._id, qty: 1 }, { productId: sugar._id, qty: 2 }],
    });
    expect(await stock.reserveStock(Product, b._id, 2)).not.toBeNull();
    expect((await Product.findById(tea._id).lean())?.soldQuantity).toBe(2);
    expect((await Product.findById(sugar._id).lean())?.soldQuantity).toBe(4);
    expect((await Product.findById(b._id).lean())?.status).toBe('in_stock');

    await stock.releaseStock(Product, b._id, 1);
    expect((await Product.findById(tea._id).lean())?.soldQuantity).toBe(1);
    expect((await Product.findById(sugar._id).lean())?.soldQuantity).toBe(2);
  });

  it('to\'plam: bitta tarkib yetmasa — hech narsa ayrilmaydi', async () => {
    const tea = await goods(10);
    const sugar = await goods(3);
    const b = await Product.create({
      name: 'Set', imei: code(), kind: 'bundle', purchasePrice: 0, salePrice: 5000, status: 'in_stock', branchId,
      bundleItems: [{ productId: tea._id, qty: 1 }, { productId: sugar._id, qty: 2 }],
    });
    expect(await stock.reserveStock(Product, b._id, 2)).toBeNull(); // shakar 4 kerak, 3 bor
    expect((await Product.findById(tea._id).lean())?.soldQuantity).toBe(0);
    expect((await Product.findById(sugar._id).lean())?.soldQuantity).toBe(0);
  });

  it('to\'plam: tarkibning oxirgisi sotilsa tovar «sotildi», qaytsa — qayta omborda', async () => {
    const tea = await goods(2);
    const b = await Product.create({
      name: 'Juft', imei: code(), kind: 'bundle', purchasePrice: 0, salePrice: 1, status: 'in_stock', branchId,
      bundleItems: [{ productId: tea._id, qty: 2 }],
    });
    expect(await stock.reserveStock(Product, b._id, 1)).not.toBeNull();
    expect((await Product.findById(tea._id).lean())?.status).toBe('sold');
    expect(await stock.reserveStock(Product, b._id, 1)).toBeNull();
    await stock.releaseStock(Product, b._id, 1);
    expect((await Product.findById(tea._id).lean())?.status).toBe('in_stock');
  });

  it('boshqa filialdagi tovar to\'plam tarkibidan ayrilmaydi', async () => {
    const far = await goods(10, { branchId: otherBranch });
    const b = await Product.create({
      name: 'Xato set', imei: code(), kind: 'bundle', purchasePrice: 0, salePrice: 1, status: 'in_stock', branchId,
      bundleItems: [{ productId: far._id, qty: 1 }],
    });
    expect(await stock.reserveStock(Product, b._id, 1)).toBeNull();
    expect((await Product.findById(far._id).lean())?.soldQuantity).toBe(0);
  });

  it('oddiy tovar avvalgidek ishlaydi', async () => {
    const g = await goods(1);
    expect((await stock.reserveStock(Product, g._id, 1))?.status).toBe('sold');
    const single = await Product.create({ name: 'iPhone', imei: code(), purchasePrice: 1, salePrice: 2, status: 'in_stock', branchId });
    expect((await stock.reserveStock(Product, single._id, 1))?.status).toBe('sold');
    await stock.releaseStock(Product, single._id, 1);
    expect((await Product.findById(single._id).lean())?.status).toBe('in_stock');
  });
});
