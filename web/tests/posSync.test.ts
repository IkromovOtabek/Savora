/**
 * Oflayn POS sinxronlash — haqiqiy MongoDB bilan (MONGO_TEST_URI berilsa).
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/posSync.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { clampSoldAt, OFFLINE_MAX_AGE_MS } from '@/lib/posSync';

vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));

const URI = process.env.MONGO_TEST_URI;

describe('clampSoldAt', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  it('kelajak → hozir, juda eski → 30 kun oldin, oddiy → o\'zi', () => {
    expect(clampSoldAt(new Date('2026-10-20T00:00:00Z'), now)).toEqual(now);
    expect(clampSoldAt(new Date('2026-01-01T00:00:00Z'), now).getTime()).toBe(now.getTime() - OFFLINE_MAX_AGE_MS);
    const ok = new Date('2026-10-18T09:00:00Z');
    expect(clampSoldAt(ok, now)).toEqual(ok);
  });
});

describe.skipIf(!URI)('applyOfflineSale (MongoDB)', () => {
  let conn: mongoose.Connection;
  let Product: mongoose.Model<import('@/lib/models/tenant/Product').IProduct>;
  let Sale: mongoose.Model<import('@/lib/models/tenant/Sale').ISale>;
  const branchId = new Types.ObjectId();
  const admin = { id: 'u1', username: 'ali', role: 'admin' as const, branchId: undefined, dbName: 'x' };
  const allow = { canDiscount: true, canEditPrice: true };
  let apply: typeof import('@/lib/posSync').applyOfflineSale;

  beforeAll(async () => {
    conn = await mongoose.createConnection(`${URI}/savora_pos_test_${Date.now()}`).asPromise();
    const { productSchema } = await import('@/lib/models/tenant/Product');
    const { saleSchema } = await import('@/lib/models/tenant/Sale');
    Product = conn.model('Product', productSchema);
    Sale = conn.model('Sale', saleSchema);
    await Sale.init();
    apply = (await import('@/lib/posSync')).applyOfflineSale;
  });
  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  async function product(over: Record<string, unknown> = {}) {
    return Product.create({
      name: 'Kabel', imei: `K${Date.now()}${Math.random().toString(36).slice(2, 7)}`, purchasePrice: 5000, salePrice: 10000,
      trackQuantity: true, quantity: 3, soldQuantity: 0, status: 'in_stock', branchId, ...over,
    });
  }
  const item = (productId: string, over: Record<string, unknown> = {}) => ({
    clientSaleId: `c-${Math.random().toString(36).slice(2, 12)}`, productId, qty: 1, totalAmount: 10000,
    soldAt: new Date(Date.now() - 2 * 3600_000), notes: '', ...over,
  });

  it('ok: sotuv yoziladi, ombor kamayadi, sana oflayn vaqt', async () => {
    const p = await product();
    const it1 = item(String(p._id), { qty: 2, totalAmount: 20000 });
    const r = await apply({ Product, Sale }, admin, it1, allow);
    expect(r.status).toBe('ok');
    const s = await Sale.findById(r.saleId).lean();
    expect(s?.offline).toBe(true);
    expect(s?.paymentType).toBe('cash');
    expect(s?.createdAt?.getTime()).toBe(it1.soldAt.getTime());
    expect(s?.payments[0].paidAt.getTime()).toBe(it1.soldAt.getTime());
    expect((await Product.findById(p._id).lean())?.soldQuantity).toBe(2);
  });

  it('duplicate: qayta yuborilsa ikki marta yozilmaydi (parallel ham)', async () => {
    const p = await product();
    const it1 = item(String(p._id));
    const [a, b] = await Promise.all([
      apply({ Product, Sale }, admin, it1, allow),
      apply({ Product, Sale }, admin, it1, allow),
    ]);
    expect([a.status, b.status].sort()).toEqual(['duplicate', 'ok']);
    expect(a.saleId).toBe(b.saleId);
    expect(await Sale.countDocuments({ clientSaleId: it1.clientSaleId })).toBe(1);
    expect((await Product.findById(p._id).lean())?.soldQuantity).toBe(1);
  });

  it('conflict: omborda qolmagan', async () => {
    const p = await product({ trackQuantity: false, quantity: 1 });
    expect((await apply({ Product, Sale }, admin, item(String(p._id)), allow)).status).toBe('ok');
    const r = await apply({ Product, Sale }, admin, item(String(p._id)), allow);
    expect(r).toMatchObject({ status: 'conflict', reason: 'outOfStock' });
  });

  it('rejected: chegirma huquqi yo\'q / boshqa filial mahsuloti', async () => {
    const p = await product();
    const r = await apply({ Product, Sale }, admin, item(String(p._id), { totalAmount: 9000 }), { canDiscount: false, canEditPrice: true });
    expect(r).toMatchObject({ status: 'rejected', reason: 'priceDiscount' });
    const other = { ...admin, role: 'user' as const, branchId: String(new Types.ObjectId()) };
    const r2 = await apply({ Product, Sale }, other, item(String(p._id)), allow);
    expect(r2).toMatchObject({ status: 'rejected', reason: 'productNotFound' });
    expect((await Product.findById(p._id).lean())?.soldQuantity).toBe(0);
  });
});
