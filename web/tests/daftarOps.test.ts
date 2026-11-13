/**
 * Daftar ↔ kassa bog'lanishi. Sof funksiyalar doim; Mongo qismi faqat MONGO_TEST_URI berilsa:
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/daftarOps.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { openingFlowType, paymentFlowType, phoneTailPattern, DAFTAR_CASH_CATEGORY } from '@/lib/daftarOps';
import { ledgerRemaining } from '@/lib/models/tenant/LedgerEntry';
import { opexFromFlows } from '@/lib/monitoring';
import { getDictionary } from '@/lib/i18n/dict';

vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));

const URI = process.env.MONGO_TEST_URI;
const k = getDictionary('uz').sales.daftar;

describe('daftar: sof qoidalar', () => {
  it("berdim — kassadan chiqim, qaytganda kirim; oldim — teskarisi", () => {
    expect(openingFlowType('given')).toBe('expense');
    expect(paymentFlowType('given')).toBe('income');
    expect(openingFlowType('taken')).toBe('income');
    expect(paymentFlowType('taken')).toBe('expense');
  });

  it("qoldiq: eski yozuvda paidAmount yo'q — butun summa; manfiy bo'lmaydi", () => {
    expect(ledgerRemaining({ amount: 500_000, paidAmount: undefined as unknown as number })).toBe(500_000);
    expect(ledgerRemaining({ amount: 500_000, paidAmount: 200_000 })).toBe(300_000);
    expect(ledgerRemaining({ amount: 500_000, paidAmount: 700_000 })).toBe(0);
  });

  it('telefon: oxirgi 9 raqam, ajratgichlar farqi yo\'q', () => {
    const re = phoneTailPattern('998901234567')!;
    expect(re.test('+998 90 123-45-67')).toBe(true);
    expect(re.test('901234567')).toBe(true);
    expect(re.test('(90) 123 45 67')).toBe(true);
    expect(re.test('+998 90 123 45 68')).toBe(false);
    expect(phoneTailPattern('1234')).toBeNull();
  });

  it("«Qarz daftari» toifasidagi kassa yozuvlari sof foydaga kirmaydi", () => {
    const cats = [{ name: 'Ijara', type: 'expense' as const, system: false }];
    const opex = opexFromFlows([
      { type: 'expense', amount: 1_000_000, category: DAFTAR_CASH_CATEGORY },
      { type: 'income', amount: 400_000, category: DAFTAR_CASH_CATEGORY },
      { type: 'expense', amount: 300_000, category: 'Ijara' },
    ], cats);
    expect(opex.expense).toBe(300_000);
    expect(opex.income).toBe(0);
  });
});

describe.skipIf(!URI)('daftarOps (MongoDB)', () => {
  let conn: mongoose.Connection;
  let ops: typeof import('@/lib/daftarOps');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any;
  let branchA: string;
  let branchB: string;
  const admin = { id: 'u1', username: 'ega', role: 'admin' as const, branchId: undefined, dbName: 'x' };
  const due = () => new Date(Date.now() + 7 * 86400_000);

  beforeAll(async () => {
    conn = await mongoose.createConnection(`${URI}/savora_daftar_test_${Date.now()}`).asPromise();
    const [{ ledgerEntrySchema }, { cashFlowSchema }, { cashShiftSchema }, { saleSchema }, { branchSchema }, { customerSchema }] = await Promise.all([
      import('@/lib/models/tenant/LedgerEntry'),
      import('@/lib/models/tenant/CashFlow'),
      import('@/lib/models/tenant/CashShift'),
      import('@/lib/models/tenant/Sale'),
      import('@/lib/models/tenant/Branch'),
      import('@/lib/models/tenant/Customer'),
    ]);
    m = {
      LedgerEntry: conn.model('LedgerEntry', ledgerEntrySchema),
      CashFlow: conn.model('CashFlow', cashFlowSchema),
      CashShift: conn.model('CashShift', cashShiftSchema),
      Sale: conn.model('Sale', saleSchema),
      Branch: conn.model('Branch', branchSchema),
      Customer: conn.model('Customer', customerSchema),
    };
    await m.CashShift.init();
    branchA = String((await m.Branch.create({ name: 'Chilonzor', active: true }))._id);
    branchB = String((await m.Branch.create({ name: 'Yunusobod', active: true }))._id);
    ops = await import('@/lib/daftarOps');
  });
  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  const input = (over: Record<string, unknown> = {}) => ({
    type: 'given' as const, personName: 'Aziz', personPhone: '998901112233', amount: 500_000, dueDate: due(), ...over,
  });

  it("kassasiz yozuv — CashFlow yaratilmaydi", async () => {
    const r = await ops.createLedgerEntry(admin, m, k, { ...input(), toKassa: false });
    expect(r.ok).toBe(true);
    const id = (r as { id: string }).id;
    expect(await m.CashFlow.countDocuments({ ledgerEntryId: id })).toBe(0);
    const e = await m.LedgerEntry.findById(id).lean();
    expect(e.kassaBranchId).toBeUndefined();
    expect(e.paidAmount).toBe(0);
  });

  it("admin, bir nechta filial, filial tanlanmagan — xato, hech narsa yozilmaydi", async () => {
    const before = await m.LedgerEntry.countDocuments();
    const r = await ops.createLedgerEntry(admin, m, k, { ...input(), toKassa: true });
    expect(r).toEqual({ ok: false, error: k.kassaPickBranch });
    expect(await m.LedgerEntry.countDocuments()).toBe(before);
  });

  it("berdim + kassa: chiqim; qisman qaytish kirim; to'liq qaytganda yopiladi", async () => {
    const r = await ops.createLedgerEntry(admin, m, k, { ...input({ amount: 1_000_000 }), toKassa: true, kassaBranchId: branchA });
    expect(r.ok).toBe(true);
    const id = (r as { id: string }).id;
    const open = await m.CashFlow.find({ ledgerEntryId: id }).lean();
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ type: 'expense', amount: 1_000_000, category: DAFTAR_CASH_CATEGORY });
    expect(String(open[0].branchId)).toBe(branchA);

    // Qisman, kassaga — kirim; filial berilmasa yozuvning kassasi olinadi
    expect((await ops.addLedgerPayment(admin, m, k, { id, amount: 300_000, toKassa: true })).ok).toBe(true);
    // Qisman, shaxsiy — kassaga yozilmaydi
    expect((await ops.addLedgerPayment(admin, m, k, { id, amount: 200_000, toKassa: false })).ok).toBe(true);
    let e = await m.LedgerEntry.findById(id).lean();
    expect(e.status).toBe('open');
    expect(e.paidAmount).toBe(500_000);
    expect(ledgerRemaining(e)).toBe(500_000);

    // Qoldiqdan ko'p — rad etiladi
    const over = await ops.addLedgerPayment(admin, m, k, { id, amount: 600_000, toKassa: false });
    expect(over.ok).toBe(false);

    // To'liq (amount yo'q — butun qoldiq)
    expect((await ops.addLedgerPayment(admin, m, k, { id, toKassa: true, kassaBranchId: branchA })).ok).toBe(true);
    e = await m.LedgerEntry.findById(id).lean();
    expect(e.status).toBe('returned');
    expect(e.paidAmount).toBe(1_000_000);
    expect(e.payments.map((p: { toKassa: boolean }) => p.toKassa)).toEqual([true, false, true]);
    const flows = await m.CashFlow.find({ ledgerEntryId: id }).sort({ createdAt: 1 }).lean();
    expect(flows.map((f: { type: string; amount: number }) => `${f.type}:${f.amount}`)).toEqual(['expense:1000000', 'income:300000', 'income:500000']);

    // Yopilgan yozuvga qayta to'lov yo'q
    expect((await ops.addLedgerPayment(admin, m, k, { id, amount: 1, toKassa: false })).ok).toBe(false);
  });

  it("oxirgi qaytarishni bekor qilish — yozuv ochiladi, o'sha kassa kirimi o'chadi", async () => {
    const r = await ops.createLedgerEntry(admin, m, k, { ...input({ amount: 400_000 }), toKassa: true, kassaBranchId: branchA });
    const id = (r as { id: string }).id;
    await ops.addLedgerPayment(admin, m, k, { id, toKassa: true });
    expect(await m.CashFlow.countDocuments({ ledgerEntryId: id })).toBe(2);

    expect((await ops.undoLastLedgerPayment(admin, m, k, { id })).ok).toBe(true);
    const e = await m.LedgerEntry.findById(id).lean();
    expect(e.status).toBe('open');
    expect(e.paidAmount).toBe(0);
    expect(e.payments).toHaveLength(0);
    const live = await m.CashFlow.find({ ledgerEntryId: id }).lean();
    expect(live.map((f: { type: string }) => f.type)).toEqual(['expense']);
  });

  it("ochiq smena: kassadagi naqddan ko'p qarz berib bo'lmaydi; berilsa smenaga bog'lanadi", async () => {
    const shift = await m.CashShift.create({ shiftNo: 'K-1', branchId: branchB, status: 'open', openedAt: new Date(Date.now() - 3600_000), openedBy: 'ega', openingCash: 200_000 });
    const tooMuch = await ops.createLedgerEntry(admin, m, k, { ...input({ amount: 250_000 }), toKassa: true, kassaBranchId: branchB });
    expect(tooMuch.ok).toBe(false);
    expect((tooMuch as { error: string }).error).toContain('200');

    const r = await ops.createLedgerEntry(admin, m, k, { ...input({ amount: 150_000 }), toKassa: true, kassaBranchId: branchB });
    expect(r.ok).toBe(true);
    const flow = await m.CashFlow.findOne({ ledgerEntryId: (r as { id: string }).id }).lean();
    expect(String(flow.shiftId)).toBe(String(shift._id));
  });

  it("oldim + kassa: kirim; qaytarishda chiqim", async () => {
    const r = await ops.createLedgerEntry(admin, m, k, { ...input({ type: 'taken', amount: 700_000 }), toKassa: true, kassaBranchId: branchA });
    const id = (r as { id: string }).id;
    await ops.addLedgerPayment(admin, m, k, { id, toKassa: true });
    const flows = await m.CashFlow.find({ ledgerEntryId: id }).sort({ createdAt: 1 }).lean();
    expect(flows.map((f: { type: string }) => f.type)).toEqual(['income', 'expense']);
  });

  it("o'chirish — yozuv va unga bog'langan kassa yozuvlari soft-delete", async () => {
    const r = await ops.createLedgerEntry(admin, m, k, { ...input(), toKassa: true, kassaBranchId: branchA });
    const id = (r as { id: string }).id;
    await ops.addLedgerPayment(admin, m, k, { id, amount: 100_000, toKassa: true });
    expect((await ops.deleteLedgerEntry(admin, m, k, { id })).ok).toBe(true);
    expect(await m.LedgerEntry.findById(id).lean()).toBeNull();
    expect(await m.CashFlow.countDocuments({ ledgerEntryId: id })).toBe(0);
    expect(await m.CashFlow.countDocuments({ ledgerEntryId: id }).setOptions({ withDeleted: true })).toBe(2);
  });

  it("filial xodimi: o'z filiali kassasi, boshqa filial so'rovi e'tiborsiz; boshqa filial yozuvini ko'rmaydi", async () => {
    const clerk = { id: 'u2', username: 'kassir', role: 'user' as const, branchId: branchB, dbName: 'x' };
    const r = await ops.createLedgerEntry(clerk, m, k, { ...input({ amount: 10_000 }), toKassa: true, kassaBranchId: branchA });
    expect(r.ok).toBe(true);
    const flow = await m.CashFlow.findOne({ ledgerEntryId: (r as { id: string }).id }).lean();
    expect(String(flow.branchId)).toBe(branchB);

    const other = await ops.createLedgerEntry(admin, m, k, { ...input(), toKassa: false });
    const res = await ops.addLedgerPayment(clerk, m, k, { id: (other as { id: string }).id, toKassa: false });
    expect(res).toEqual({ ok: false, error: k.notFound });
  });

  it('mijoz telefon bo\'yicha bog\'lanadi (bitta aniq moslik bo\'lsa)', async () => {
    const c = await m.Customer.create({ fullName: 'Bobur', phone: '+998 93 555-44-33' });
    const r = await ops.createLedgerEntry(admin, m, k, { ...input({ personPhone: '998935554433' }), toKassa: false });
    const e = await m.LedgerEntry.findById((r as { id: string }).id).lean();
    expect(String(e.customerId)).toBe(String(c._id));

    // Ikki mijozda bir raqam — bog'lanmaydi
    await m.Customer.create({ fullName: 'Dilshod', phone: '997776655' });
    await m.Customer.create({ fullName: 'Dilshod 2', phone: '+998 99 777 66 55' });
    const r2 = await ops.createLedgerEntry(admin, m, k, { ...input({ personPhone: '998997776655' }), toKassa: false });
    const e2 = await m.LedgerEntry.findById((r2 as { id: string }).id).lean();
    expect(e2.customerId).toBeUndefined();
  });

  it("parallel ikki to'liq qaytarish — faqat bittasi o'tadi (qoldiqdan ortiq yozilmaydi)", async () => {
    const r = await ops.createLedgerEntry(admin, m, k, { ...input({ amount: 100_000 }), toKassa: false });
    const id = (r as { id: string }).id;
    const res = await Promise.all([
      ops.addLedgerPayment(admin, m, k, { id, toKassa: false }),
      ops.addLedgerPayment(admin, m, k, { id, toKassa: false }),
    ]);
    expect(res.filter((x) => x.ok)).toHaveLength(1);
    const e = await m.LedgerEntry.findById(id).lean();
    expect(e.paidAmount).toBe(100_000);
    expect(e.payments).toHaveLength(1);
  });

  it('eski yozuv (paidAmount/payments yo\'q) ham qaytariladi', async () => {
    const legacy = await m.LedgerEntry.collection.insertOne({
      type: 'given', personName: 'Eski', personPhone: '998900000001', amount: 50_000, dueDate: due(),
      status: 'open', createdBy: 'ega', deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    });
    const res = await ops.addLedgerPayment(admin, m, k, { id: String(legacy.insertedId), toKassa: false });
    expect(res.ok).toBe(true);
    const e = await m.LedgerEntry.findById(legacy.insertedId).lean();
    expect(e.status).toBe('returned');
    expect(e.paidAmount).toBe(50_000);
  });

  it('noto\'g\'ri id/branch — xato qaytadi, otmaydi', async () => {
    const r = await ops.createLedgerEntry(admin, m, k, { ...input(), toKassa: true, kassaBranchId: 'bad' });
    expect(r).toEqual({ ok: false, error: k.kassaPickBranch });
    const r2 = await ops.addLedgerPayment(admin, m, k, { id: String(new Types.ObjectId()), toKassa: false });
    expect(r2).toEqual({ ok: false, error: k.notFound });
  });
});
