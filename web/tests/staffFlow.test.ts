/**
 * Xodimlar (bir filialga bir nechta login) — haqiqiy MongoDB bilan (MONGO_TEST_URI berilsa):
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/staffFlow.test.ts
 * Global login registri va master nusxa mock qilinadi (test master bazaga yozmaydi).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';

const taken = new Set<string>(['band_login']);
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock('@/lib/orgUsers', () => ({
  addOrgUser: vi.fn(async () => {}),
  updateOrgUserByUsername: vi.fn(async () => {}),
  removeOrgUserByUsername: vi.fn(async () => {}),
}));
vi.mock('@/lib/userDirectory', () => {
  class UsernameTakenError extends Error {}
  return {
    UsernameTakenError,
    isUsernameAvailable: vi.fn(async (u: string) => !taken.has(u)),
    reserveUsername: vi.fn(async (e: { username: string }) => { if (taken.has(e.username)) throw new UsernameTakenError(e.username); taken.add(e.username); }),
    releaseUsername: vi.fn(async (u: string) => { taken.delete(u); }),
    updateDirectoryBranch: vi.fn(async () => {}),
  };
});

const URI = process.env.MONGO_TEST_URI;

describe.skipIf(!URI)('xodimlar (MongoDB)', () => {
  let conn: mongoose.Connection;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any;
  let staff: typeof import('@/lib/staff');
  let d: import('@/lib/i18n/dict').Dict;
  const main = new Types.ObjectId();
  const chilonzor = new Types.ObjectId();
  const adminId = new Types.ObjectId();
  const org = { _id: new Types.ObjectId(), dbName: 'test', plan: { tier: 'starter', maxFilial: 1, maxUsers: 3 } };
  const actor = { id: String(adminId), username: 'egasi', role: 'admin' as const, dbName: 'test', organizationId: String(org._id) };
  let waiterRole: string;

  beforeAll(async () => {
    conn = await mongoose.createConnection(`${URI}/savora_staff_test_${Date.now()}`).asPromise();
    const s = {
      User: (await import('@/lib/models/tenant/User')).userSchema,
      Branch: (await import('@/lib/models/tenant/Branch')).branchSchema,
      Role: (await import('@/lib/models/tenant/Role')).roleSchema,
      Order: (await import('@/lib/models/tenant/Order')).orderSchema,
      Sale: (await import('@/lib/models/tenant/Sale')).saleSchema,
    };
    m = Object.fromEntries(Object.entries(s).map(([k, schema]) => [k, conn.model(k, schema as mongoose.Schema)]));
    await Promise.all(Object.values(m).map((M) => (M as mongoose.Model<unknown>).init()));
    staff = await import('@/lib/staff');
    d = (await import('@/lib/i18n/dict')).getDictionary('uz');
    await m.Branch.create([
      { _id: main, name: 'Asosiy ombor', isMain: true, active: true },
      { _id: chilonzor, name: 'Chilonzor', active: true },
    ]);
    await m.User.create([
      { _id: adminId, username: 'egasi', password: 'x', role: 'admin', active: true },
      { username: 'chilonzor', password: 'x', role: 'user', fullName: 'Chilonzor', branchId: chilonzor, active: true },
    ]);
    waiterRole = String((await m.Role.create({ name: 'Ofitsant', permissions: ['order.create'] }))._id);
  });

  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  it('xodim qo\'shish: bir filialga, ism + rol; filial logini o\'zgarmaydi', async () => {
    const r = await staff.createStaff(m, org, actor, { branchId: String(main), fullName: '  Aziz   Karimov ', username: 'Aziz_1', password: 'secret1', roleId: waiterRole }, d);
    expect(r).toMatchObject({ ok: true, data: { username: 'aziz_1', fullName: 'Aziz Karimov' } });
    const u = await m.User.findOne({ username: 'aziz_1' }).lean();
    expect(u).toMatchObject({ staff: true, role: 'user', fullName: 'Aziz Karimov' });
    expect(String(u.branchId)).toBe(String(main));
    expect(String(u.roleId)).toBe(waiterRole);
    expect(u.password).not.toBe('secret1'); // bcrypt
    expect(await m.User.countDocuments({ branchId: chilonzor })).toBe(1);
  });

  it('tekshiruvlar: ism, login formati, parol, filial, band login', async () => {
    const base = { branchId: String(chilonzor), fullName: 'Vali', username: 'vali', password: 'secret1' };
    expect(await staff.createStaff(m, org, actor, { ...base, fullName: ' ' }, d)).toMatchObject({ ok: false, error: d.crm.team.staff.errName });
    expect(await staff.createStaff(m, org, actor, { ...base, username: 'va li!' }, d)).toMatchObject({ ok: false, error: d.crm.team.staff.errLoginFormat });
    expect(await staff.createStaff(m, org, actor, { ...base, password: '123' }, d)).toMatchObject({ ok: false, error: d.crm.team.errPasswordShort });
    expect(await staff.createStaff(m, org, actor, { ...base, branchId: String(new Types.ObjectId()) }, d)).toMatchObject({ ok: false, error: d.crm.team.staff.errBranch });
    // Band login (limit tekshiruvi undan oldin — shu yerda keng tarif bilan)
    const wide = { ...org, plan: { ...org.plan, maxUsers: 50 } };
    expect(await staff.createStaff(m, wide, actor, { ...base, username: 'aziz_1' }, d)).toMatchObject({ ok: false, status: 409 });
    expect(await staff.createStaff(m, wide, actor, { ...base, username: 'band_login' }, d)).toMatchObject({ ok: false, error: d.crm.team.errLoginTakenGlobal });
  });

  it('tarif limiti (maxUsers = 3, faol loginlar): to\'lganda qo\'shish va faollashtirish bloklanadi', async () => {
    // egasi + chilonzor + aziz_1 = 3 — limitda
    const r = await staff.createStaff(m, org, actor, { branchId: String(chilonzor), fullName: 'Vali', username: 'vali', password: 'secret1' }, d);
    expect(r).toMatchObject({ ok: false, status: 403 });
    const aziz = await m.User.findOne({ username: 'aziz_1' }).lean();
    // Bloklash — o'rin bo'shaydi, sessiyalar yopiladi
    expect(await staff.updateStaff(m, org, actor, { userId: String(aziz._id), active: false }, d)).toMatchObject({ ok: true });
    const blocked = await m.User.findById(aziz._id).lean();
    expect(blocked.active).toBe(false);
    expect(blocked.tokenVersion).toBe(1);
    expect(await staff.createStaff(m, org, actor, { branchId: String(chilonzor), fullName: 'Vali', username: 'vali', password: 'secret1' }, d)).toMatchObject({ ok: true });
    // Endi yana limitda — bloklangan xodimni faollashtirib bo'lmaydi
    expect(await staff.updateStaff(m, org, actor, { userId: String(aziz._id), active: true }, d)).toMatchObject({ ok: false, status: 403 });
  });

  it('tahrirlash: ism, filial (sessiya yopiladi), parol; filial logini xodim emas', async () => {
    const vali = await m.User.findOne({ username: 'vali' }).lean();
    expect(await staff.updateStaff(m, org, actor, { userId: String(vali._id), fullName: 'Vali Aka', branchId: String(main), newPassword: 'newpass1' }, d)).toMatchObject({ ok: true });
    const after = await m.User.findById(vali._id);
    expect(after.fullName).toBe('Vali Aka');
    expect(String(after.branchId)).toBe(String(main));
    expect(await after.comparePassword('newpass1')).toBe(true);
    expect(after.tokenVersion).toBe(1);
    const branchLogin = await m.User.findOne({ username: 'chilonzor' }).lean();
    expect(await staff.updateStaff(m, org, actor, { userId: String(branchLogin._id), fullName: 'X' }, d)).toMatchObject({ ok: false, error: d.crm.team.staff.errNotStaff });
    expect(await staff.updateStaff(m, org, actor, { userId: String(adminId), fullName: 'X' }, d)).toMatchObject({ ok: false });
  });

  it('o\'chirish: tarixi bor xodim — rad (nofaol qiling), tarixsiz — o\'chadi va login bo\'shaydi', async () => {
    const vali = await m.User.findOne({ username: 'vali' }).lean();
    await m.Sale.collection.insertOne({ saleNo: 'S1', soldBy: 'vali', branchId: main, totalAmount: 1, paidAmount: 1, remainingAmount: 0, status: 'paid' });
    expect(await staff.deleteStaff(m, actor, String(vali._id), d)).toMatchObject({ ok: false, status: 409 });
    const aziz = await m.User.findOne({ username: 'aziz_1' }).lean();
    expect(await staff.deleteStaff(m, actor, String(aziz._id), d)).toMatchObject({ ok: true });
    expect(await m.User.exists({ username: 'aziz_1' })).toBeNull();
    expect(taken.has('aziz_1')).toBe(false);
    expect(await staff.staffCountInBranch(m, String(main))).toBe(1);
  });
});
