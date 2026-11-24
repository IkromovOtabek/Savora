/**
 * Filial xodimining xarajati (kassa.expense). Huquq qoidalari doim; Mongo qismi faqat MONGO_TEST_URI berilsa:
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/branchExpense.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import { effectivePermissions, PERMISSIONS, ROLE_DEFAULT_PERMISSIONS } from '@/lib/permissions';
import { DEFAULT_ROLES } from '@/lib/models/tenant/Role';
import { getDictionary } from '@/lib/i18n/dict';

vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));

const URI = process.env.MONGO_TEST_URI;
const dict = getDictionary('uz');
const D = { fin: dict.sales.fin, shifts: dict.sales.shifts };

describe('kassa.expense: huquq', () => {
  it("filial login standartida bor; Kirim-chiqim moduliga bog'langan, faqat egasi emas", () => {
    expect(ROLE_DEFAULT_PERMISSIONS.user).toContain('kassa.expense');
    expect(PERMISSIONS['kassa.expense'].feature).toBe('kirimChiqim');
    expect(PERMISSIONS['kassa.expense'].adminOnly).toBeFalsy();
  });

  it("eski (6-versiya) ro'yxat: kassadan pul ola olgan xodimga meros, olmaganga — yo'q", () => {
    expect(effectivePermissions({ role: 'user', permissions: ['kassa.view', 'kassa.shift'], permVersion: 6 }).has('kassa.expense')).toBe(true);
    expect(effectivePermissions({ role: 'user', permissions: ['kassa.view'], permVersion: 6 }).has('kassa.expense')).toBe(false);
  });

  it("7-versiyada egasi olib qo'ygan huquq qayta qo'shilmaydi", () => {
    expect(effectivePermissions({ role: 'user', permissions: ['kassa.shift'], permVersion: 7 }).has('kassa.expense')).toBe(false);
  });

  it('smena ochadigan tayyor rollarda ham bor', () => {
    for (const r of DEFAULT_ROLES.filter((x) => x.permissions.includes('kassa.shift'))) {
      expect(r.permissions, r.name).toContain('kassa.expense');
    }
  });

  it("lug'at: ruxsat nomi va filial izohi ikki tilda", () => {
    for (const lang of ['uz', 'ru'] as const) {
      const d = getDictionary(lang);
      expect(d.sales.fin.qeHintBranch).toBeTruthy();
    }
  });
});

describe.skipIf(!URI)('addBranchExpense (MongoDB)', () => {
  let conn: mongoose.Connection;
  let addBranchExpense: typeof import('@/lib/branchExpense').addBranchExpense;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any;
  let branchA: string;
  let branchB: string;
  const staff = (branchId: string) => ({ id: 'u2', username: 'kassir', role: 'user' as const, branchId, dbName: 'x', tokenVersion: 0 });
  const admin = { id: 'u1', username: 'ega', role: 'admin' as const, branchId: undefined, dbName: 'x', tokenVersion: 0 };

  beforeAll(async () => {
    conn = await mongoose.createConnection(`${URI}/savora_branch_expense_test_${Date.now()}`).asPromise();
    const [{ cashFlowSchema }, { cashShiftSchema }, { saleSchema }, { branchSchema }, { financeCategorySchema }] = await Promise.all([
      import('@/lib/models/tenant/CashFlow'),
      import('@/lib/models/tenant/CashShift'),
      import('@/lib/models/tenant/Sale'),
      import('@/lib/models/tenant/Branch'),
      import('@/lib/models/tenant/FinanceCategory'),
    ]);
    m = {
      CashFlow: conn.model('CashFlow', cashFlowSchema),
      CashShift: conn.model('CashShift', cashShiftSchema),
      Sale: conn.model('Sale', saleSchema),
      Branch: conn.model('Branch', branchSchema),
      FinanceCategory: conn.model('FinanceCategory', financeCategorySchema),
    };
    await m.CashShift.init();
    branchA = String((await m.Branch.create({ name: 'Chilonzor', active: true }))._id);
    branchB = String((await m.Branch.create({ name: 'Yunusobod', active: true }))._id);
    await m.FinanceCategory.create([
      { name: 'Ijara', type: 'expense', active: true },
      { name: 'Eski toifa', type: 'expense', active: false },
      { name: 'Kassadan olindi', type: 'expense', active: true, system: true },
    ]);
    ({ addBranchExpense } = await import('@/lib/branchExpense'));
  });
  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  it("smenasiz: o'z filialiga toifali chiqim, cheklovsiz", async () => {
    const r = await addBranchExpense(staff(branchA), m, D, { amount: 2_000_000, category: 'Ijara', note: 'noyabr' });
    expect('success' in r).toBe(true);
    const f = await m.CashFlow.findOne({ description: 'noyabr' }).lean();
    expect(f).toMatchObject({ type: 'expense', amount: 2_000_000, category: 'Ijara', recordedBy: 'kassir' });
    expect(String(f.branchId)).toBe(branchA);
    expect(f.shiftId).toBeUndefined();
  });

  it("izoh bo'sh — toifa nomi", async () => {
    await addBranchExpense(staff(branchB), m, D, { amount: 10_000, category: 'Ijara' });
    const f = await m.CashFlow.findOne({ branchId: branchB }).lean();
    expect(f.description).toBe('Ijara');
  });

  it("tizim, o'chirilgan yoki yo'q toifa — rad etiladi", async () => {
    for (const category of ['Kassadan olindi', 'Eski toifa', 'Yo‘q']) {
      expect(await addBranchExpense(staff(branchA), m, D, { amount: 1000, category })).toEqual({ error: D.fin.badCategory });
    }
  });

  it("do'kon egasi va filialsiz login — bu yo'l emas", async () => {
    expect(await addBranchExpense(admin, m, D, { amount: 1000, category: 'Ijara' })).toEqual({ error: D.shifts.badBranch });
    expect(await addBranchExpense({ ...staff(''), branchId: undefined as unknown as string }, m, D, { amount: 1000, category: 'Ijara' }))
      .toEqual({ error: D.shifts.badBranch });
  });

  it("ochiq smena: smenaga bog'lanadi, kassadagi puldan oshmaydi va smena kassasini kamaytiradi", async () => {
    const { shiftTotalsNow } = await import('@/lib/cashShiftOps');
    // Smena ochilishidan oldingi yozuvlar smena kassasiga kirmasin
    const shift = await m.CashShift.create({
      shiftNo: 'K-1', branchId: branchA, status: 'open', openedAt: new Date(Date.now() + 1000), openedBy: 'kassir', openingCash: 500_000,
    });
    const over = await addBranchExpense(staff(branchA), m, D, { amount: 600_000, category: 'Ijara' });
    expect('error' in over && over.error).toContain('500');

    await new Promise((r) => setTimeout(r, 1100));
    const ok = await addBranchExpense(staff(branchA), m, D, { amount: 200_000, category: 'Ijara', note: 'svet' });
    expect('success' in ok).toBe(true);
    const f = await m.CashFlow.findOne({ description: 'svet' }).lean();
    expect(String(f.shiftId)).toBe(String(shift._id));
    expect((await shiftTotalsNow(m, shift)).current).toBe(300_000);
  });
});
