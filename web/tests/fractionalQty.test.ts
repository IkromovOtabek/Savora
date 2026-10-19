/**
 * Kasr miqdor (kg, g, m, m2, l): sotuv, qaytarish, hisobdan chiqarish (inventarizatsiya), ko'chirish.
 * Sof qoidalar doim; atomik ombor yangilashlari — haqiqiy MongoDB bilan (MONGO_TEST_URI berilsa):
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/fractionalQty.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { fmtQty, isFractionalUnit, isValidQty, parseQty, priceTimesQty, qtyLabel, roundQty } from '@/lib/qty';
import { checkSaleQty, clampQtyToStock, getStockQty, parseQtyField } from '@/lib/productQuantity';
import { computePartialReturn } from '@/lib/saleReturn';
import { planWriteOff } from '@/lib/stockAdjust';
import { qtyWithUnit } from '@/lib/i18n/fmt';
import { getDictionary } from '@/lib/i18n';

vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));

const URI = process.env.MONGO_TEST_URI;

describe('qty — birlik qoidalari', () => {
  it('kasrli birliklar: kg, g, m, m2, l; qolganlari butun', () => {
    for (const u of ['kg', 'g', 'm', 'm2', 'l']) expect(isFractionalUnit(u)).toBe(true);
    for (const u of ['dona', 'qop', 'quti', 'paket', undefined, null, '']) expect(isFractionalUnit(u)).toBe(false);
  });

  it('parseQty: kg da ≤3 xona kasr, vergul ham; dona da faqat butun', () => {
    expect(parseQty('1.5', 'kg')).toBe(1.5);
    expect(parseQty('1,5', 'kg')).toBe(1.5);
    expect(parseQty('2.25', 'm')).toBe(2.25);
    expect(parseQty('0.001', 'kg')).toBe(0.001);
    expect(parseQty('0.0005', 'kg')).toBeNull(); // 3 xonadan ko'p
    expect(parseQty('1.2345', 'kg')).toBeNull();
    expect(parseQty('0', 'kg')).toBeNull();
    expect(parseQty('-1', 'kg')).toBeNull();
    expect(parseQty('abc', 'kg')).toBeNull();
    expect(parseQty('', 'kg')).toBeNull();
    expect(parseQty('3', 'dona')).toBe(3);
    expect(parseQty('1.5', 'dona')).toBeNull();
    expect(parseQty('1.5', undefined)).toBeNull();
    expect(parseQty('2', 'qop')).toBe(2);
    expect(parseQty(1.5, 'l')).toBe(1.5);
  });

  it('isValidQty: float qoldig\'i bor qiymat (0.1+0.2) 3 xonali deb qabul qilinadi', () => {
    expect(isValidQty(0.1 + 0.2, 'kg')).toBe(true);
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
    expect(roundQty(10 - 8.9)).toBe(1.1);
  });

  it("priceTimesQty: butun so'mga yarmi yuqoriga yaxlitlanadi", () => {
    expect(priceTimesQty(12_000, 1.5)).toBe(18_000);
    expect(priceTimesQty(1999, 0.335)).toBe(670); // 669.665 → 670 (float'da 669 chiqardi)
    expect(priceTimesQty(33_333, 0.001)).toBe(33);
    expect(priceTimesQty(5000, 3)).toBe(15_000);
    expect(priceTimesQty(25_000, 2.25)).toBe(56_250);
  });

  it("fmtQty / qtyLabel / qtyWithUnit: '1,5 kg', '3 ta'", () => {
    expect(fmtQty(1.5)).toBe('1,5');
    expect(fmtQty(2)).toBe('2');
    expect(fmtQty(0.1 + 0.2)).toBe('0,3');
    expect(qtyLabel(1.5, 'kg')).toBe('1,5 kg');
    expect(qtyLabel(2.25, 'm2')).toBe('2,25 m²');
    expect(qtyLabel(3, 'dona')).toBe('3 ta');
    expect(qtyLabel(3, undefined)).toBe('3 ta');
    expect(qtyWithUnit(1.5, 'kg', getDictionary('uz').stock.fields.units)).toBe('1,5 kg');
    expect(qtyWithUnit(3, undefined, getDictionary('ru').stock.fields.units)).toBe('3 шт.');
  });

  it('parseQtyField: kg da kasr saqlanadi, dona da avvalgidek pastga butunlanadi', () => {
    expect(parseQtyField('12.5', 1, 'kg')).toBe(12.5);
    expect(parseQtyField('0,75', 1, 'l')).toBe(0.75);
    expect(parseQtyField('0', 1, 'kg')).toBe(1);
    expect(parseQtyField('2.9', 1, 'dona')).toBe(2);
    expect(parseQtyField('2.9')).toBe(2);
  });
});

describe('sotuv miqdori (checkSaleQty)', () => {
  const kg = { trackQuantity: true, quantity: 10, soldQuantity: 8.9, status: 'in_stock' as const, unit: 'kg' as const };
  const dona = { trackQuantity: true, quantity: 5, soldQuantity: 0, status: 'in_stock' as const, unit: 'dona' as const };

  it("kg: 1.1 kg qoldiq bor (10 − 8.9) — aynan 1.1 sotiladi", () => {
    expect(getStockQty(kg)).toBe(1.1);
    expect(checkSaleQty(kg, 1.1)).toEqual({ ok: true, qty: 1.1 });
    expect(checkSaleQty(kg, 1.2)).toEqual({ ok: false, reason: 'notEnough', available: 1.1 });
  });

  it('dona: kasr rad etiladi, kiritilmagan — 1, yaroqsiz (null) — badQty', () => {
    expect(checkSaleQty(dona, 1.5)).toEqual({ ok: false, reason: 'badQty' });
    expect(checkSaleQty(dona, undefined)).toEqual({ ok: true, qty: 1 });
    expect(checkSaleQty(dona, null)).toEqual({ ok: false, reason: 'badQty' });
    expect(checkSaleQty(dona, 6)).toEqual({ ok: false, reason: 'notEnough', available: 5 });
  });

  it("son yuritilmaydigan (IMEI) mahsulot — doim 1", () => {
    expect(checkSaleQty({ trackQuantity: false, quantity: 1, soldQuantity: 0, status: 'in_stock' }, 3)).toEqual({ ok: true, qty: 1 });
  });
});

describe("ko'chirish miqdori (clampQtyToStock)", () => {
  const kg = { trackQuantity: true, quantity: 10, soldQuantity: 2.5, status: 'in_stock' as const, unit: 'kg' as const };

  it("kg: kasr ko'chiriladi; qoldiqdan oshsa qoldiqqacha qisqaradi", () => {
    expect(clampQtyToStock(kg, 2.25)).toEqual({ ok: true, qty: 2.25 });
    expect(clampQtyToStock(kg, 100)).toEqual({ ok: true, qty: 7.5 });
  });

  it("qoldiq yo'q → noStock; dona da kasr → badQty", () => {
    expect(clampQtyToStock({ ...kg, soldQuantity: 10 }, 1)).toEqual({ ok: false, reason: 'noStock' });
    expect(clampQtyToStock({ ...kg, unit: 'dona' as const, soldQuantity: 0 }, 1.5)).toEqual({ ok: false, reason: 'badQty' });
    expect(clampQtyToStock(kg, null)).toEqual({ ok: false, reason: 'badQty' });
  });
});

describe('qaytarish (computePartialReturn) — kasr', () => {
  const sale = { qty: 2.5, unit: 'kg', totalAmount: 50_000, paidAmount: 50_000, remainingAmount: 0, paymentType: 'cash' as const, status: 'paid' };

  it("2.5 kg dan 0.5 kg qaytadi — summa mutanosib, qolgan 2 kg", () => {
    const r = computePartialReturn(sale, 0.5);
    if (!r.ok) throw new Error(r.error);
    expect(r.calc).toMatchObject({ amount: 10_000, refundAmount: 10_000, newQty: 2, newTotal: 40_000, newPaid: 40_000, newStatus: 'paid' });
  });

  it('float qoldig\'isiz: 0.3 kg dan 0.1 kg (0.3 − 0.1 = 0.2)', () => {
    const r = computePartialReturn({ ...sale, qty: 0.3, totalAmount: 3000, paidAmount: 3000 }, 0.1);
    if (!r.ok) throw new Error(r.error);
    expect(r.calc.newQty).toBe(0.2);
    expect(r.calc.amount).toBe(1000);
  });

  it("dona sotuvda kasr qaytarish rad etiladi; hammasi — bekor qilish orqali", () => {
    expect(computePartialReturn({ ...sale, qty: 3, unit: 'dona' }, 1.5)).toEqual({ ok: false, error: 'badQty' });
    expect(computePartialReturn({ ...sale, qty: 3, unit: undefined }, 1.5)).toEqual({ ok: false, error: 'badQty' });
    expect(computePartialReturn(sale, 2.5)).toEqual({ ok: false, error: 'useCancel' });
    expect(computePartialReturn(sale, 0.0001)).toEqual({ ok: false, error: 'badQty' });
  });
});

describe('hisobdan chiqarish (planWriteOff) — kasr', () => {
  it('10 kg dan 2.5 kg chiqariladi → 7.5 kg', () => {
    expect(planWriteOff({ trackQuantity: true, quantity: 10, soldQuantity: 0, unit: 'kg' }, 2.5)).toEqual({ ok: true, set: { quantity: 7.5 } });
  });

  it('qolgan 0.3 kg (float: 1.1 − 0.8) to\'liq chiqariladi → Sotilgan', () => {
    expect(planWriteOff({ trackQuantity: true, quantity: 1.1, soldQuantity: 0.8, unit: 'kg' }, 0.3))
      .toEqual({ ok: true, set: { quantity: 0.8, status: 'sold' } });
  });

  it("dona da kasr va qoldiqdan ko'p rad etiladi", () => {
    expect(planWriteOff({ trackQuantity: true, quantity: 10, soldQuantity: 0, unit: 'dona' }, 2.5)).toEqual({ ok: false, reason: 'qty' });
    expect(planWriteOff({ trackQuantity: true, quantity: 1, soldQuantity: 0, unit: 'kg' }, 1.001)).toEqual({ ok: false, reason: 'qty' });
  });
});

describe.skipIf(!URI)('ombor atomik yangilashlari — kasr (MongoDB)', () => {
  let conn: mongoose.Connection;
  let Product: mongoose.Model<import('@/lib/models/tenant/Product').IProduct>;
  let Sale: mongoose.Model<import('@/lib/models/tenant/Sale').ISale>;
  let stock: typeof import('@/lib/stock');
  let apply: typeof import('@/lib/posSync').applyOfflineSale;
  const branchId = new Types.ObjectId();
  const otherBranch = new Types.ObjectId();
  const admin = { id: 'u1', username: 'ali', role: 'admin' as const, branchId: undefined, dbName: 'x' };
  const allow = { canDiscount: true, canEditPrice: true };

  beforeAll(async () => {
    conn = await mongoose.createConnection(`${URI}/savora_qty_test_${Date.now()}`).asPromise();
    const { productSchema } = await import('@/lib/models/tenant/Product');
    const { saleSchema } = await import('@/lib/models/tenant/Sale');
    Product = conn.model('Product', productSchema);
    Sale = conn.model('Sale', saleSchema);
    await Sale.init();
    stock = await import('@/lib/stock');
    apply = (await import('@/lib/posSync')).applyOfflineSale;
  });
  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  async function product(over: Record<string, unknown> = {}) {
    return Product.create({
      name: 'Guruch', imei: `G${Date.now()}${Math.random().toString(36).slice(2, 7)}`, purchasePrice: 10_000, salePrice: 14_000,
      trackQuantity: true, quantity: 10, soldQuantity: 0, status: 'in_stock', branchId, unit: 'kg', ...over,
    });
  }

  it("1.1 kg ×3 sotuv: soldQuantity aynan 3.3 (float qoldig'isiz), oxirgi 6.7 kg ham sotiladi", async () => {
    const p = await product();
    for (let i = 0; i < 3; i++) expect(await stock.reserveStock(Product, p._id, 1.1)).not.toBeNull();
    expect((await Product.findById(p._id).lean())?.soldQuantity).toBe(3.3);
    const last = await stock.reserveStock(Product, p._id, 6.7, {
      history: { action: 'sold', detail: '6,7 kg', by: 'ali', at: new Date() },
    });
    expect(last?.status).toBe('sold');
    const after = await Product.findById(p._id).lean();
    expect(after?.soldQuantity).toBe(10);
    expect(after?.status).toBe('sold');
    expect(after?.history?.at(-1)?.detail).toBe('6,7 kg');
  });

  it("qoldiqdan ko'p sotilmaydi; pipeline $set qiymati maydon yo'li deb o'qilmaydi", async () => {
    const p = await product({ quantity: 2 });
    expect(await stock.reserveStock(Product, p._id, 2.001)).toBeNull();
    const r = await stock.reserveStock(Product, p._id, 1.5, { set: { notes: '$name', soldPaymentType: 'cash' } });
    expect(r?.soldQuantity).toBe(1.5);
    expect(r?.notes).toBe('$name');
  });

  it('releaseStock: 0.5 kg qaytadi, status in_stock', async () => {
    const p = await product({ quantity: 1.5, soldQuantity: 1.5, status: 'sold' });
    await stock.releaseStock(Product, p._id, 0.5, { action: 'returned', detail: '0,5 kg', by: 'ali', at: new Date() });
    const after = await Product.findById(p._id).lean();
    expect(after?.soldQuantity).toBe(1);
    expect(after?.status).toBe('in_stock');
  });

  it("transferStock: 10 kg dan 2.25 kg ko'chadi → 7.75 kg qoladi", async () => {
    const p = await product();
    const moved = await stock.transferStock(Product, p._id, otherBranch, 2.25, {
      trackQuantity: true, history: { action: 'transferred', detail: '2,25 kg', by: 'ali', at: new Date() },
    });
    expect(moved).not.toBeNull();
    expect((await Product.findById(p._id).lean())?.quantity).toBe(7.75);
  });

  it("transferStock: hammasi (sotilgan qismi bor) ko'chsa — status sold", async () => {
    const p = await product({ quantity: 3.3, soldQuantity: 1.1 });
    expect(await stock.transferStock(Product, p._id, otherBranch, 2.2, {
      trackQuantity: true, history: { action: 'transferred', by: 'ali', at: new Date() },
    })).not.toBeNull();
    const after = await Product.findById(p._id).lean();
    expect(after?.quantity).toBe(1.1);
    expect(after?.status).toBe('sold');
  });

  it("oflayn sotuv 1.5 kg: jami tekshiruvi priceTimesQty, birlik snapshot'da", async () => {
    const p = await product();
    const r = await apply({ Product, Sale }, admin, {
      clientSaleId: `c-${Math.random().toString(36).slice(2, 12)}`, productId: String(p._id), qty: 1.5, totalAmount: 21_000,
      soldAt: new Date(Date.now() - 3600_000), notes: '',
    }, { canDiscount: false, canEditPrice: false });
    expect(r.status).toBe('ok');
    const s = await Sale.findById(r.saleId).lean();
    expect(s?.productSnapshot.saleQuantity).toBe(1.5);
    expect(s?.productSnapshot.unit).toBe('kg');
    expect((await Product.findById(p._id).lean())?.soldQuantity).toBe(1.5);
  });

  it('oflayn sotuv: dona mahsulotda 1.5 rad etiladi', async () => {
    const p = await product({ unit: 'dona' });
    const r = await apply({ Product, Sale }, admin, {
      clientSaleId: `c-${Math.random().toString(36).slice(2, 12)}`, productId: String(p._id), qty: 1.5, totalAmount: 21_000,
      soldAt: new Date(), notes: '',
    }, allow);
    expect(r).toMatchObject({ status: 'rejected', reason: 'badQty' });
  });
});
