/**
 * Oshxona printeri oqimi — haqiqiy MongoDB bilan (MONGO_TEST_URI berilsa):
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/kitchenPrintFlow.test.ts
 * Yuborish → printeri yoqilgan stansiyaga varaq → qurilma oladi (boshqasi ololmaydi) → chop etildi;
 * muddati o'tgan olish boshqa qurilmaga o'tadi; bekor qilish varag'i; qayta chop etish (NUSXA + audit);
 * eskirgan varaq avtomatik chiqmaydi; huquq va filial chegarasi.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';

const recordAudit = vi.fn(async () => {});
vi.mock('@/lib/audit', () => ({ recordAudit }));
vi.mock('@/lib/onboarding', () => ({ markOnboardingStep: vi.fn(async () => {}) }));
vi.mock('@/lib/shopNotify', () => ({ notifyNewSale: vi.fn(async () => {}), salePayLabel: () => 'naqd' }));

const URI = process.env.MONGO_TEST_URI;

describe.skipIf(!URI)('oshxona printeri oqimi (MongoDB)', () => {
  let conn: mongoose.Connection;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any;
  let ops: typeof import('@/lib/restaurant/ops');
  let setup: typeof import('@/lib/restaurant/setup');
  let pq: typeof import('@/lib/restaurant/printQueue');
  type PK = import('@/lib/permissions').PermissionKey;

  const branchId = new Types.ObjectId();
  const otherBranch = new Types.ObjectId();
  const ids = { admin: new Types.ObjectId().toString(), ali: new Types.ObjectId().toString(), chef: new Types.ObjectId().toString(), alien: new Types.ObjectId().toString() };
  const user = (id: string, username: string, role: 'admin' | 'user' = 'user', branch = branchId) =>
    ({ id, username, role, tokenVersion: 0, dbName: 'test', organizationId: 'org', ...(role === 'user' ? { branchId: String(branch) } : {}) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let admin: any, ali: any, chef: any, alien: any;
  let kitchenId = '', barId = '', table3 = '';
  const P: Record<string, string> = {};

  beforeAll(async () => {
    conn = await mongoose.createConnection(`${URI}/savora_print_test_${Date.now()}`).asPromise();
    const s = {
      Order: (await import('@/lib/models/tenant/Order')).orderSchema,
      PrintJob: (await import('@/lib/models/tenant/PrintJob')).printJobSchema,
      Table: (await import('@/lib/models/tenant/Table')).tableSchema,
      Hall: (await import('@/lib/models/tenant/Hall')).hallSchema,
      KitchenStation: (await import('@/lib/models/tenant/KitchenStation')).kitchenStationSchema,
      Product: (await import('@/lib/models/tenant/Product')).productSchema,
      Sale: (await import('@/lib/models/tenant/Sale')).saleSchema,
      User: (await import('@/lib/models/tenant/User')).userSchema,
      Branch: (await import('@/lib/models/tenant/Branch')).branchSchema,
      ShopSettings: (await import('@/lib/models/tenant/ShopSettings')).shopSettingsSchema,
      ProductCategory: (await import('@/lib/models/tenant/ProductCategory')).productCategorySchema,
      Role: (await import('@/lib/models/tenant/Role')).roleSchema,
    };
    m = Object.fromEntries(Object.entries(s).map(([k, schema]) => [k, conn.model(k, schema as mongoose.Schema)]));
    await Promise.all(Object.values(m).map((M) => (M as mongoose.Model<unknown>).init()));
    ops = await import('@/lib/restaurant/ops');
    setup = await import('@/lib/restaurant/setup');
    pq = await import('@/lib/restaurant/printQueue');
    const d = (await import('@/lib/i18n/dict')).getDictionary('uz');
    const { resolveOrgFeatures } = await import('@/lib/features');
    const { PERMISSION_KEYS } = await import('@/lib/permissions');
    const features = resolveOrgFeatures({ plan: { tier: 'pro', maxFilial: 3, maxUsers: 10 }, businessType: 'restaurant' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (u: ReturnType<typeof user>, perms: PK[]): any => ({ user: u, orgId: 'a'.repeat(24), orgSlug: 'osh', m, perms: new Set(perms), features, d });
    admin = ctx(user(ids.admin, 'egasi', 'admin'), [...PERMISSION_KEYS]);
    ali = ctx(user(ids.ali, 'ali'), ['order.create']);
    chef = ctx(user(ids.chef, 'oshpaz'), ['kitchen.view', 'kitchen.bump']);
    alien = ctx(user(ids.alien, 'begona', 'user', otherBranch), ['kitchen.view']);

    await m.Branch.create([{ _id: branchId, name: 'Chilonzor', active: true }, { _id: otherBranch, name: 'Yunusobod', active: true }]);
    await m.User.create([{ _id: ids.ali, username: 'ali', fullName: 'Ali Valiyev', password: 'x', role: 'user', branchId, active: true }]);
    await m.ShopSettings.create({ key: 'main', restaurant: { serviceChargePct: 10, takeawayPackFee: 2000, requireVoidReason: true } });
    const hall = await setup.saveHall(admin, { name: 'Zal', branchId: String(branchId) });
    const hallId = hall.ok ? hall.data.id : '';
    await setup.createTablesRange(admin, { hallId, from: 3, to: 3, seats: 4 });
    table3 = String((await m.Table.findOne({ branchId, number: 3 }).lean())._id);
    const k = await setup.saveStation(admin, { name: 'Issiq sex', kind: 'kitchen', branchId: String(branchId), printEnabled: true });
    const b = await setup.saveStation(admin, { name: 'Bar', kind: 'bar', branchId: String(branchId) });
    kitchenId = k.ok ? k.data.id : '';
    barId = b.ok ? b.data.id : '';
    const mk = (over: Record<string, unknown>) => m.Product.create({
      imei: `P${Math.random().toString(36).slice(2, 10)}`, purchasePrice: 1000, salePrice: 1000, branchId, status: 'in_stock', trackQuantity: true, quantity: 50, menuItem: true, ...over,
    });
    const osh = await mk({ name: 'Osh', salePrice: 45000 });
    const cola = await mk({ name: 'Cola', salePrice: 10000 });
    const non = await mk({ name: 'Non', kind: 'service', trackQuantity: false, salePrice: 3000 });
    Object.assign(P, { osh: String(osh._id), cola: String(cola._id), non: String(non._id) });
    expect((await setup.updateMenuItem(admin, P.osh, { stationId: kitchenId })).ok).toBe(true);
    expect((await setup.updateMenuItem(admin, P.cola, { stationId: barId })).ok).toBe(true);
  });

  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  const poll = (c: unknown, deviceId: string, claim = true, stationId?: string) =>
    pq.printStationPoll(c as never, { deviceId, claim, ...(stationId ? { stationId } : {}) });

  let orderId = '';

  it("yuborilganda faqat printeri yoqilgan stansiyaga varaq; ofitsant ismi bilan", async () => {
    const opened = await ops.openOrder(ali, { type: 'dine_in', tableId: table3, guests: 2 });
    expect(opened.ok).toBe(true);
    orderId = opened.ok ? opened.data.order.id : '';
    const added = await ops.addItems(ali, orderId, [
      { productId: P.osh, qty: 2, note: 'piyozsiz' }, { productId: P.cola, qty: 1 }, { productId: P.non, qty: 1 },
    ]);
    expect(added.ok ? true : `${added.code}: ${added.error}`).toBe(true);
    expect((await ops.sendItems(ali, orderId)).ok).toBe(true);

    const jobs = await m.PrintJob.find({ orderId }).lean();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ kind: 'order', stationName: 'Issiq sex', tableNumber: 3, guests: 2, waiterName: 'Ali Valiyev', status: 'pending', attempts: 0, createdBy: 'ali' });
    expect(String(jobs[0].stationId)).toBe(kitchenId);
    expect(jobs[0].lines.map((l: { name: string; qty: number; note?: string }) => [l.name, l.qty, l.note])).toEqual([['Osh', 2, 'piyozsiz']]);
  });

  it('bir varaqni bitta qurilma oladi; chop etilgach qayta berilmaydi', async () => {
    const a = await poll(chef, 'pr-device-aaaa');
    expect(a.ok && a.data.jobs.map((j) => j.lines[0].name)).toEqual(['Osh']);
    const jobId = a.ok ? a.data.jobs[0].id : '';
    expect(a.ok && a.data.stations).toEqual([
      { id: kitchenId, name: 'Issiq sex', kind: 'kitchen', printEnabled: true },
      { id: barId, name: 'Bar', kind: 'bar', printEnabled: false },
    ]);

    // Boshqa qurilma — olmaydi; shu qurilma (sahifa qayta ochildi) — o'zinikini qayta oladi
    const b = await poll(chef, 'pr-device-bbbb');
    expect(b.ok && b.data.jobs).toEqual([]);
    expect(b.ok && b.data.recent.map((j) => j.id)).toContain(jobId);
    const again = await poll(chef, 'pr-device-aaaa');
    expect(again.ok && again.data.jobs.map((j) => j.id)).toEqual([jobId]);

    // Chop etish to'xtatilgan (claim: false) — faqat ro'yxat
    const list = await poll(chef, 'pr-device-cccc', false);
    expect(list.ok && list.data.jobs).toEqual([]);

    expect(await pq.markPrintJobPrinted(chef, jobId)).toEqual({ ok: true, data: { id: jobId, printed: true } });
    expect(await pq.markPrintJobPrinted(chef, jobId)).toEqual({ ok: true, data: { id: jobId, printed: false } });
    const after = await poll(chef, 'pr-device-aaaa');
    expect(after.ok && after.data.jobs).toEqual([]);
    const row = after.ok ? after.data.recent.find((j) => j.id === jobId) : null;
    expect(row).toMatchObject({ status: 'printed', printedBy: 'oshpaz', stale: false });
  });

  it("olingan, lekin belgilanmagan varaq muddat o'tgach boshqa qurilmaga o'tadi", async () => {
    expect((await ops.addItems(ali, orderId, [{ productId: P.osh, qty: 1 }])).ok).toBe(true);
    expect((await ops.sendItems(ali, orderId)).ok).toBe(true);
    const a = await poll(chef, 'pr-device-aaaa');
    const jobId = a.ok ? a.data.jobs[0]?.id : '';
    expect(jobId).toBeTruthy();
    expect((await poll(chef, 'pr-device-bbbb')).ok).toBe(true);
    await m.PrintJob.updateOne({ _id: jobId }, { $set: { claimedAt: new Date(Date.now() - pq.PRINT_LEASE_MS - 1000) } });
    const b = await poll(chef, 'pr-device-bbbb');
    expect(b.ok && b.data.jobs.map((j) => [j.id, j.attempts])).toEqual([[jobId, 2]]);
    expect((await pq.markPrintJobPrinted(chef, jobId)).ok).toBe(true);
  });

  it("oshxonadagi taom bekor qilinsa — «BEKOR» varag'i sabab bilan; yuborilmagani uchun — yo'q", async () => {
    const o = await m.Order.findById(orderId).lean();
    const sentOsh = o.items.find((i: { name: string; status: string }) => i.name === 'Osh' && i.status === 'sent');
    expect((await ops.voidItem(admin, orderId, { itemId: String(sentOsh._id), qty: 1, reason: 'mijoz voz kechdi' })).ok).toBe(true);
    const voids = await m.PrintJob.find({ orderId, kind: 'void' }).lean();
    expect(voids).toHaveLength(1);
    expect(voids[0].lines).toMatchObject([{ name: 'Osh', qty: 1, reason: 'mijoz voz kechdi' }]);

    expect((await ops.addItems(ali, orderId, [{ productId: P.osh, qty: 1 }])).ok).toBe(true);
    const fresh = (await m.Order.findById(orderId).lean()).items.find((i: { status: string }) => i.status === 'new');
    expect((await ops.voidItem(ali, orderId, { itemId: String(fresh._id) })).ok).toBe(true);
    expect(await m.PrintJob.countDocuments({ orderId, kind: 'void' })).toBe(1);

    // Bar (printer o'chiq) taomi bekor qilinsa ham varaq yo'q
    const cola = (await m.Order.findById(orderId).lean()).items.find((i: { name: string; status: string }) => i.name === 'Cola' && i.status === 'sent');
    expect((await ops.voidItem(admin, orderId, { itemId: String(cola._id), reason: 'xato' })).ok).toBe(true);
    expect(await m.PrintJob.countDocuments({ orderId, kind: 'void' })).toBe(1);

    const p = await poll(chef, 'pr-device-aaaa');
    expect(p.ok && p.data.jobs.map((j) => j.kind)).toEqual(['void']);
    if (p.ok) await pq.markPrintJobPrinted(chef, p.data.jobs[0].id);
  });

  it("qayta chop etish: NUSXA belgili yangi varaq, asl tarix saqlanadi, auditga yoziladi", async () => {
    const orig = await m.PrintJob.findOne({ orderId, kind: 'order', status: 'printed' }).sort({ createdAt: 1 }).lean();
    recordAudit.mockClear();
    const r = await pq.reprintPrintJob(chef, String(orig._id));
    expect(r.ok).toBe(true);
    const copyId = r.ok ? r.data.id : '';
    expect(copyId).not.toBe(String(orig._id));
    const copy = await m.PrintJob.findById(copyId).lean();
    expect(copy).toMatchObject({ copy: true, status: 'pending', attempts: 0, createdBy: 'oshpaz', stationName: 'Issiq sex' });
    expect((await m.PrintJob.findById(orig._id).lean()).status).toBe('printed');
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ username: 'oshpaz' }), expect.objectContaining({ action: 'print.reprint', entityId: orderId }));
    const p = await poll(chef, 'pr-device-aaaa', true, kitchenId);
    expect(p.ok && p.data.jobs.map((j) => [j.id, j.copy])).toEqual([[copyId, true]]);
    if (p.ok) await pq.markPrintJobPrinted(chef, copyId);
  });

  it("eskirgan varaq avtomatik chiqmaydi, ro'yxatda «chop etilmadi»", async () => {
    const orig = await m.PrintJob.findOne({ orderId }).lean();
    const { _id, ...rest } = orig;
    void _id;
    const old = await m.PrintJob.create({ ...rest, status: 'pending', queuedAt: new Date(Date.now() - pq.PRINT_MAX_AGE_MS - 60_000), attempts: 0, claimedAt: undefined, claimedBy: undefined, copy: undefined });
    const p = await poll(chef, 'pr-device-aaaa');
    expect(p.ok && p.data.jobs).toEqual([]);
    expect(p.ok && p.data.recent.find((j) => j.id === String(old._id))).toMatchObject({ status: 'pending', stale: true });
  });

  it('huquq va filial chegarasi', async () => {
    expect(await poll(ali, 'pr-device-aaaa')).toMatchObject({ ok: false, code: 'noPermission' });
    const any = await m.PrintJob.findOne({ orderId }).lean();
    expect(await pq.markPrintJobPrinted(alien, String(any._id))).toMatchObject({ ok: false, code: 'printJobNotFound' });
    expect(await pq.reprintPrintJob(alien, String(any._id))).toMatchObject({ ok: false, code: 'printJobNotFound' });
    expect(await pq.markPrintJobPrinted(chef, 'zz')).toMatchObject({ ok: false, code: 'printJobNotFound' });
    // Boshqa filial xodimi o'z filialining (bo'sh) navbatini ko'radi
    const p = await poll(alien, 'pr-device-dddd');
    expect(p.ok && p.data.branchId).toBe(String(otherBranch));
    expect(p.ok && p.data.recent).toEqual([]);
  });

  it("stansiya sozlamasi: printEnabled yuborilmasa o'zgarmaydi", async () => {
    expect((await setup.saveStation(admin, { id: kitchenId, name: 'Issiq sex', kind: 'kitchen' })).ok).toBe(true);
    expect((await m.KitchenStation.findById(kitchenId).lean()).printEnabled).toBe(true);
    expect((await setup.saveStation(admin, { id: kitchenId, name: 'Issiq sex', kind: 'kitchen', printEnabled: false })).ok).toBe(true);
    expect((await m.KitchenStation.findById(kitchenId).lean()).printEnabled).toBe(false);
    // Endi yuborilgan taom navbatga tushmaydi
    const before = await m.PrintJob.countDocuments({ orderId });
    expect((await ops.addItems(ali, orderId, [{ productId: P.osh, qty: 1 }])).ok).toBe(true);
    expect((await ops.sendItems(ali, orderId)).ok).toBe(true);
    expect(await m.PrintJob.countDocuments({ orderId })).toBe(before);
  });
});
