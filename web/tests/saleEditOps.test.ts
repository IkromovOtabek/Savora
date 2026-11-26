/**
 * Sotuvni tahrirlash (lib/saleEditOps) — haqiqiy MongoDB bilan (MONGO_TEST_URI berilsa):
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/saleEditOps.test.ts
 * Narx (naqd → qaytarish yozuvi, qarz → qoldiq, nasiya → oylar), mijoz (xariddagi barcha tovarlarga),
 * muddat qoidalari, huquq, filial chegarasi, tarix.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';

vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));

const URI = process.env.MONGO_TEST_URI;

describe.skipIf(!URI)('editSale (MongoDB)', () => {
  let conn: mongoose.Connection;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any;
  let editSale: typeof import('@/lib/saleEditOps').editSale;
  const branchA = new Types.ObjectId();
  const branchB = new Types.ObjectId();
  const admin = { id: 'a', username: 'egasi', role: 'admin' as const, tokenVersion: 1, dbName: 'test' };
  const kassirB = { id: 'b', username: 'kassir', role: 'user' as const, tokenVersion: 1, dbName: 'test', branchId: String(branchB) };
  let n = 0;
  const base = (over: Record<string, unknown> = {}) => ({
    saleNo: `S-${++n}`, productId: new Types.ObjectId(), productSnapshot: { name: 'Telefon', imei: `IM${n}`, purchasePrice: 5_000 },
    branchId: branchA, paymentType: 'cash', totalAmount: 150_000, paidAmount: 150_000, remainingAmount: 0, status: 'paid',
    payments: [{ amount: 150_000, paidAt: new Date(), method: 'cash', note: "Naqd to'lov" }], soldBy: 'ali', ...over,
  });

  beforeAll(async () => {
    conn = await mongoose.createConnection(`${URI}/savora_saleedit_test_${Date.now()}`).asPromise();
    m = {
      Sale: conn.model('Sale', (await import('@/lib/models/tenant/Sale')).saleSchema),
      Customer: conn.model('Customer', (await import('@/lib/models/tenant/Customer')).customerSchema),
    };
    await Promise.all(Object.values(m).map((M) => (M as mongoose.Model<unknown>).init()));
    editSale = (await import('@/lib/saleEditOps')).editSale;
  });
  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  it("naqd sotuv arzonlashdi: qaytarish yozuvi (kind: 'price'), tarix, holat to'langan", async () => {
    const s = await m.Sale.create(base());
    const r = await editSale(m, admin, String(s._id), { totalAmount: 15_000 }, { canEditPrice: true });
    expect(r.ok).toBe(true);
    const after = await m.Sale.findById(s._id).lean();
    expect(after).toMatchObject({ totalAmount: 15_000, paidAmount: 15_000, remainingAmount: 0, status: 'paid' });
    expect(after.returns).toHaveLength(1);
    expect(after.returns[0]).toMatchObject({ kind: 'price', qty: 0, amount: 135_000, refundAmount: 135_000, debtReduced: 0, by: 'egasi' });
    expect(after.edits[0].changes).toEqual([{ field: 'totalAmount', from: '150000', to: '15000' }]);
    // To'lovlar tarixi o'zgarmaydi (kassa o'z kunida)
    expect(after.payments.map((p: { amount: number }) => p.amount)).toEqual([150_000]);
  });

  it("narx huquqisiz — rad; o'zgarishsiz — noChanges", async () => {
    const s = await m.Sale.create(base());
    expect(await editSale(m, admin, String(s._id), { totalAmount: 1_000 }, { canEditPrice: false })).toEqual({ ok: false, error: 'pricePerm' });
    expect(await editSale(m, admin, String(s._id), { totalAmount: 150_000, notes: '' }, { canEditPrice: false })).toEqual({ ok: false, error: 'noChanges' });
  });

  it("naqd sotuv qimmatlashdi: qoldiq paydo bo'ladi, muddat qo'yish mumkin", async () => {
    const s = await m.Sale.create(base({ totalAmount: 15_000, paidAmount: 15_000, payments: [{ amount: 15_000, paidAt: new Date() }] }));
    const due = new Date('2026-12-31');
    const r = await editSale(m, admin, String(s._id), { totalAmount: 150_000, dueDate: due }, { canEditPrice: true });
    expect(r.ok).toBe(true);
    const after = await m.Sale.findById(s._id).lean();
    expect(after).toMatchObject({ totalAmount: 150_000, paidAmount: 15_000, remainingAmount: 135_000, status: 'partial' });
    expect(after.dueDate.toISOString().slice(0, 10)).toBe('2026-12-31');
    expect(after.returns ?? []).toHaveLength(0);
  });

  it("to'langan naqd sotuvga muddat qo'yilmaydi, nasiyaga ham", async () => {
    const s = await m.Sale.create(base());
    expect(await editSale(m, admin, String(s._id), { dueDate: new Date('2026-12-01') }, { canEditPrice: true })).toEqual({ ok: false, error: 'dueNotAllowed' });
    const ins = await m.Sale.create(base({ paymentType: 'installment', status: 'partial', installmentMonths: 3, paidAmount: 0, remainingAmount: 150_000, payments: [] }));
    expect(await editSale(m, admin, String(ins._id), { dueDate: new Date('2026-12-01') }, { canEditPrice: true })).toEqual({ ok: false, error: 'dueNotAllowed' });
  });

  it("nasiya: narx oshdi — to'langan oylar o'zgarmaydi, farq qolganlarga", async () => {
    const createdAt = new Date('2026-08-05T10:00:00Z');
    const s = await m.Sale.create(base({
      paymentType: 'installment', status: 'partial', installmentMonths: 4, downPayment: 0, totalAmount: 400_000,
      paidAmount: 200_000, remainingAmount: 200_000, createdAt,
      payments: [{ amount: 100_000, paidAt: createdAt }, { amount: 100_000, paidAt: createdAt }],
    }));
    const r = await editSale(m, admin, String(s._id), { totalAmount: 460_000 }, { canEditPrice: true });
    expect(r.ok).toBe(true);
    const after = await m.Sale.findById(s._id).lean();
    expect(after.installmentAmounts).toEqual([100_000, 100_000, 130_000, 130_000]);
    expect(after.remainingAmount).toBe(260_000);
  });

  it('mijoz: yangi mijoz ochiladi va xariddagi barcha tovarlarga qo\'llanadi', async () => {
    const checkoutId = 'chk-1';
    const [a, b] = await m.Sale.create([
      base({ checkoutId, customerSnapshot: { fullName: 'Ali', phone: '+998901111111' } }),
      base({ checkoutId, customerSnapshot: { fullName: 'Ali', phone: '+998901111111' } }),
    ]);
    const r = await editSale(m, admin, String(a._id), { customer: { name: 'Vali Karimov', phone: '90 222 33 44' } }, { canEditPrice: false });
    expect(r.ok && r.siblings).toBe(1);
    const [x, y] = await Promise.all([m.Sale.findById(a._id).lean(), m.Sale.findById(b._id).lean()]);
    expect(x.customerSnapshot.fullName).toBe('Vali Karimov');
    expect(String(x.customerId)).toBe(String(y.customerId));
    expect(y.edits[0].changes[0]).toMatchObject({ field: 'customer', from: 'Ali · +998901111111' });
    expect(await m.Customer.countDocuments({ fullName: 'Vali Karimov' })).toBe(1);
  });

  it("telefon formati farqi — mijoz o'zgarishi emas", async () => {
    await m.Customer.create({ fullName: 'Sardor', phone: '+998 93 444 55 66' });
    const s = await m.Sale.create(base({ customerSnapshot: { fullName: 'Sardor', phone: '+998934445566' } }));
    expect(await editSale(m, admin, String(s._id), { customer: { name: 'Sardor', phone: '934445566' } }, { canEditPrice: false }))
      .toEqual({ ok: false, error: 'noChanges' });
  });

  it("qarzli sotuvdan mijoz olib tashlanmaydi; naqd sotuvdan — mumkin", async () => {
    const debt = await m.Sale.create(base({ paymentType: 'debt', status: 'partial', paidAmount: 0, remainingAmount: 150_000, payments: [], customerSnapshot: { fullName: 'Ali', phone: '+998901111111' } }));
    expect(await editSale(m, admin, String(debt._id), { customer: null }, { canEditPrice: false })).toEqual({ ok: false, error: 'customerRequired' });
    const cash = await m.Sale.create(base({ customerSnapshot: { fullName: 'Ali', phone: '+998901111111' } }));
    expect((await editSale(m, admin, String(cash._id), { customer: null }, { canEditPrice: false })).ok).toBe(true);
    expect((await m.Sale.findById(cash._id).lean()).customerSnapshot).toBeUndefined();
  });

  it('filial login boshqa filial sotuvini tahrirlay olmaydi', async () => {
    const s = await m.Sale.create(base());
    expect(await editSale(m, kassirB, String(s._id), { notes: 'x' }, { canEditPrice: true })).toEqual({ ok: false, error: 'notFound' });
  });

  it("bekor qilingan rad; bank krediti: bank ulushidan past emas, oshsa — mijoz hozir to'laydi", async () => {
    const c = await m.Sale.create(base({ status: 'cancelled' }));
    expect(await editSale(m, admin, String(c._id), { notes: 'x' }, { canEditPrice: true })).toEqual({ ok: false, error: 'cancelled' });
    const bank = await m.Sale.create(base({ paymentType: 'bank_credit', status: 'partial', paidAmount: 0, remainingAmount: 150_000, payments: [], bankParts: [{ bankName: 'Ipak', amount: 150_000 }] }));
    expect(await editSale(m, admin, String(bank._id), { totalAmount: 100_000 }, { canEditPrice: true })).toEqual({ ok: false, error: 'belowBank' });
    expect((await editSale(m, admin, String(bank._id), { notes: 'Ipak yo\'li' }, { canEditPrice: true })).ok).toBe(true);
    const r = await editSale(m, admin, String(bank._id), { totalAmount: 170_000, method: 'humo' }, { canEditPrice: true });
    expect(r.ok && r.price?.collectNow).toBe(20_000);
    const after = await m.Sale.findById(bank._id).lean();
    expect(after).toMatchObject({ totalAmount: 170_000, paidAmount: 20_000, remainingAmount: 150_000 });
    expect(after.payments.at(-1)).toMatchObject({ amount: 20_000, method: 'humo', note: "Narx o'zgartirildi — farq" });
  });

  it("naqd sotuv qimmatlashdi, hozir to'laydi: to'lov yoziladi, qoldiq yo'q", async () => {
    const s = await m.Sale.create(base());
    const r = await editSale(m, admin, String(s._id), { totalAmount: 160_000, settle: 'now', method: 'cash' }, { canEditPrice: true });
    expect(r.ok).toBe(true);
    expect(await m.Sale.findById(s._id).lean()).toMatchObject({ totalAmount: 160_000, paidAmount: 160_000, remainingAmount: 0, status: 'paid' });
  });

  it("nasiya muddati: oylar soni va to'lov kuni o'zgaradi, jadval teng bo'linadi; boshqa turda — rad", async () => {
    const ins = await m.Sale.create(base({
      paymentType: 'installment', status: 'partial', installmentMonths: 4, downPayment: 0, paidAmount: 0, remainingAmount: 150_000,
      payments: [], installmentAmounts: [10_000, 40_000, 50_000, 50_000], customerSnapshot: { fullName: 'Ali', phone: '+998901111111' },
    }));
    const r = await editSale(m, admin, String(ins._id), { installmentMonths: 6, payDay: 10 }, { canEditPrice: false });
    expect(r.ok).toBe(true);
    const after = await m.Sale.findById(ins._id).lean();
    expect(after).toMatchObject({ installmentMonths: 6, payDay: 10 });
    expect(after.installmentAmounts).toBeUndefined();
    expect(after.edits.at(-1).changes.map((c: { field: string }) => c.field)).toEqual(['installmentMonths', 'payDay']);
    expect(await editSale(m, admin, String(ins._id), { installmentMonths: 0 }, { canEditPrice: false })).toEqual({ ok: false, error: 'badMonths' });
    expect(await editSale(m, admin, String(ins._id), { payDay: 32 }, { canEditPrice: false })).toEqual({ ok: false, error: 'badPayDay' });
    const cash = await m.Sale.create(base());
    expect(await editSale(m, admin, String(cash._id), { installmentMonths: 3 }, { canEditPrice: false })).toEqual({ ok: false, error: 'termsNotAllowed' });
  });
});
