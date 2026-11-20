/**
 * Bildirishnomalar (lib/notify.ts) — haqiqiy MongoDB bilan (MONGO_TEST_URI berilsa):
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/notifyFlow.test.ts
 * Mijoz QR chaqiruvi → kim ko'radi (ofitsant A/B, kassir, boshqa filial, egasi), takrorlanmaslik va «Ko'rdim»,
 * o'qildi belgisi, hech kim yo'q — egasiga, kam qoldiq va taomga oz porsiya (chegarani kesib o'tish, dedupe,
 * «Menyu» porsiyasi bilan bir xil), push oluvchilari.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';

vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock('@/lib/onboarding', () => ({ markOnboardingStep: vi.fn(async () => {}) }));
vi.mock('@/lib/shopNotify', () => ({ notifyNewSale: vi.fn(async () => {}), salePayLabel: () => 'naqd' }));

// Tenant modellar — test bazasidagi; master — faqat do'kon modullari (restoran, Pro)
const h = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  models: null as any,
  push: [] as { dbName: string; userIds: string[]; title: string; body: string; url?: string }[],
}));
vi.mock('@/lib/tenantDb', () => ({ getTenantModels: async () => h.models, clearTenantModelCache: () => {} }));
vi.mock('@/lib/masterDb', () => ({
  getMasterModels: async () => ({
    Organization: {
      findOne: () => ({ select: () => ({ lean: async () => ({ plan: { tier: 'pro', maxFilial: 3, maxUsers: 10 }, businessType: 'restaurant' }) }) }),
    },
  }),
}));
vi.mock('@/lib/push', () => ({
  pushToShop: vi.fn(async (dbName: string, a: { userIds: string[] }, msg: { title: string; body: string; url?: string }) => {
    h.push.push({ dbName, userIds: [...a.userIds].sort(), ...msg });
    return a.userIds.length;
  }),
}));

const URI = process.env.MONGO_TEST_URI;

describe.skipIf(!URI)('bildirishnomalar (MongoDB)', () => {
  let conn: mongoose.Connection;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any;
  let notifyLib: typeof import('@/lib/notify');
  let ops: typeof import('@/lib/restaurant/ops');
  let setup: typeof import('@/lib/restaurant/setup');
  let pub: typeof import('@/lib/restaurant/public');
  let menu: typeof import('@/lib/restaurant/menuAdmin');
  let d: import('@/lib/i18n/dict').Dict;
  let features: import('@/lib/features').OrgFeatures;
  type PK = import('@/lib/permissions').PermissionKey;

  const ORG = { id: 'a'.repeat(24), dbName: 'test' };
  const branchA = new Types.ObjectId();
  const branchB = new Types.ObjectId();
  const branchC = new Types.ObjectId(); // xodimsiz filial
  const ids = {
    admin: new Types.ObjectId().toString(),
    ali: new Types.ObjectId().toString(),
    vali: new Types.ObjectId().toString(),
    kassir: new Types.ObjectId().toString(),
    oshpaz: new Types.ObjectId().toString(),
    menyuchi: new Types.ObjectId().toString(),
    boshqa: new Types.ObjectId().toString(), // B filial ofitsanti
    ketgan: new Types.ObjectId().toString(), // nofaol ofitsant
  };
  const WAITER: PK[] = ['order.create'];
  const CASHIER: PK[] = ['order.create', 'order.viewAll', 'sale.create'];
  const CHEF: PK[] = ['kitchen.view', 'kitchen.bump'];
  const MENU: PK[] = ['product.edit'];
  let ADMIN: PK[];
  const user = (id: string, username: string, role: 'admin' | 'user' = 'user', branch = branchA) =>
    ({ id, username, role, tokenVersion: 0, dbName: 'test', organizationId: 'org', ...(role === 'user' ? { branchId: String(branch) } : {}) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (u: ReturnType<typeof user>, perms: PK[]): any => ({ user: u, orgId: ORG.id, orgSlug: 'osh', m, perms: new Set(perms), features, d });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let admin: any, ali: any, vali: any, kassir: any, boshqa: any;
  const viewers = {
    admin: () => ({ v: user(ids.admin, 'egasi', 'admin'), p: new Set(ADMIN) }),
    ali: () => ({ v: user(ids.ali, 'ali'), p: new Set(WAITER) }),
    vali: () => ({ v: user(ids.vali, 'vali'), p: new Set(WAITER) }),
    kassir: () => ({ v: user(ids.kassir, 'kassir'), p: new Set(CASHIER) }),
    oshpaz: () => ({ v: user(ids.oshpaz, 'oshpaz'), p: new Set(CHEF) }),
    menyuchi: () => ({ v: user(ids.menyuchi, 'menyuchi'), p: new Set(MENU) }),
    boshqa: () => ({ v: user(ids.boshqa, 'boshqa', 'user', branchB), p: new Set(WAITER) }),
  };
  type Who = keyof typeof viewers;
  const list = async (who: Who, opts: { after?: string; limit?: number } = {}) => {
    const { v, p } = viewers[who]();
    return notifyLib.listNotifications('test', v, p, d, opts);
  };
  const kindsOf = async (who: Who) => (await list(who)).items.map((i) => `${i.kind}:${i.params.table ?? i.params.product ?? i.params.dish}`);

  const P: Record<string, string> = {};
  let hallA: string, table5: string, table6: string, tableC: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pubCtx = async (tableId: string): Promise<any> => {
    const t = await m.Table.findById(tableId).lean();
    return { org: { id: ORG.id, name: 'Osh', slug: 'osh', dbName: 'test' }, m, table: t, d };
  };
  const call = async (tableId: string, kind: 'waiter' | 'bill') => {
    await pub.publicCall(await pubCtx(tableId), kind);
    await notifyLib.settleNotifications();
  };

  beforeAll(async () => {
    conn = await mongoose.createConnection(`${URI}/savora_notify_test_${Date.now()}`).asPromise();
    const s = {
      Order: (await import('@/lib/models/tenant/Order')).orderSchema,
      Table: (await import('@/lib/models/tenant/Table')).tableSchema,
      Hall: (await import('@/lib/models/tenant/Hall')).hallSchema,
      KitchenStation: (await import('@/lib/models/tenant/KitchenStation')).kitchenStationSchema,
      PrintJob: (await import('@/lib/models/tenant/PrintJob')).printJobSchema,
      Product: (await import('@/lib/models/tenant/Product')).productSchema,
      Sale: (await import('@/lib/models/tenant/Sale')).saleSchema,
      User: (await import('@/lib/models/tenant/User')).userSchema,
      Branch: (await import('@/lib/models/tenant/Branch')).branchSchema,
      ShopSettings: (await import('@/lib/models/tenant/ShopSettings')).shopSettingsSchema,
      ProductCategory: (await import('@/lib/models/tenant/ProductCategory')).productCategorySchema,
      Role: (await import('@/lib/models/tenant/Role')).roleSchema,
      Notification: (await import('@/lib/models/tenant/Notification')).notificationSchema,
    };
    m = Object.fromEntries(Object.entries(s).map(([k, schema]) => [k, conn.model(k, schema as mongoose.Schema)]));
    await Promise.all(Object.values(m).map((M) => (M as mongoose.Model<unknown>).init()));
    h.models = m;
    notifyLib = await import('@/lib/notify');
    ops = await import('@/lib/restaurant/ops');
    setup = await import('@/lib/restaurant/setup');
    pub = await import('@/lib/restaurant/public');
    menu = await import('@/lib/restaurant/menuAdmin');
    d = (await import('@/lib/i18n/dict')).getDictionary('uz');
    const { resolveOrgFeatures } = await import('@/lib/features');
    const { PERMISSION_KEYS, PERMISSIONS_VERSION } = await import('@/lib/permissions');
    features = resolveOrgFeatures({ plan: { tier: 'pro', maxFilial: 3, maxUsers: 10 }, businessType: 'restaurant' });
    ADMIN = [...PERMISSION_KEYS];
    admin = ctx(user(ids.admin, 'egasi', 'admin'), ADMIN);
    ali = ctx(user(ids.ali, 'ali'), WAITER);
    vali = ctx(user(ids.vali, 'vali'), WAITER);
    kassir = ctx(user(ids.kassir, 'kassir'), CASHIER);
    boshqa = ctx(user(ids.boshqa, 'boshqa', 'user', branchB), WAITER);

    await m.Branch.create([
      { _id: branchA, name: 'Chilonzor', active: true },
      { _id: branchB, name: 'Yunusobod', active: true },
      { _id: branchC, name: 'Sergeli', active: true },
    ]);
    const V = PERMISSIONS_VERSION;
    const staff = (id: string, username: string, permissions: PK[], extra: Record<string, unknown> = {}) =>
      ({ _id: id, username, password: 'x', role: 'user', branchId: branchA, active: true, permissions, permVersion: V, ...extra });
    // Oshpaz huquqlari rol orqali (rol bo'lsa — shaxsiy ro'yxat e'tiborsiz)
    const chefRole = await m.Role.create({ name: 'Oshpaz', permissions: CHEF, permVersion: V });
    await m.User.create([
      { _id: ids.admin, username: 'egasi', password: 'x', role: 'admin', active: true },
      staff(ids.ali, 'ali', WAITER),
      staff(ids.vali, 'vali', WAITER),
      staff(ids.kassir, 'kassir', CASHIER),
      staff(ids.oshpaz, 'oshpaz', ['order.create'], { roleId: chefRole._id }),
      staff(ids.menyuchi, 'menyuchi', MENU),
      staff(ids.boshqa, 'boshqa', WAITER, { branchId: branchB }),
      staff(ids.ketgan, 'ketgan', WAITER, { active: false }),
    ]);
    await m.ShopSettings.create({ key: 'main', menuVersion: 1, restaurant: { serviceChargePct: 10 } });

    const hall = await setup.saveHall(admin, { name: 'Zal', branchId: String(branchA) });
    hallA = hall.ok ? hall.data.id : '';
    await setup.createTablesRange(admin, { hallId: hallA, from: 5, to: 6 });
    const hc = await setup.saveHall(admin, { name: 'Sergeli zal', branchId: String(branchC) });
    await setup.createTablesRange(admin, { hallId: hc.ok ? hc.data.id : '', from: 1, to: 1 });
    [table5, table6] = (await m.Table.find({ branchId: branchA }).sort({ number: 1 }).lean()).map((t: { _id: unknown }) => String(t._id));
    tableC = String((await m.Table.findOne({ branchId: branchC }).lean())._id);

    // Menyu: Osh (retsept: go'sht 0,5 kg + guruch 0,2 kg), Cola (tayyor tovar, 7 dona); xom ashyo — menyuda emas
    const mk = (over: Record<string, unknown>) => m.Product.create({
      imei: `P${Math.random().toString(36).slice(2, 10)}`, purchasePrice: 1000, salePrice: 1000, branchId: branchA, status: 'in_stock', ...over,
    });
    const gosht = await mk({ name: "Go'sht", unit: 'kg', trackQuantity: true, quantity: 4, minStock: 2, menuItem: false });
    const guruch = await mk({ name: 'Guruch', unit: 'kg', trackQuantity: true, quantity: 20, menuItem: false });
    const osh = await mk({
      name: 'Osh', kind: 'bundle', salePrice: 45000, menuItem: true,
      bundleItems: [{ productId: gosht._id, qty: 0.5 }, { productId: guruch._id, qty: 0.2 }],
    });
    const cola = await mk({ name: 'Cola', trackQuantity: true, quantity: 7, salePrice: 10000, menuItem: true });
    Object.assign(P, { gosht: String(gosht._id), guruch: String(guruch._id), osh: String(osh._id), cola: String(cola._id) });
  });

  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  beforeEach(() => { h.push.length = 0; });

  it('chaqiruv (ofitsantsiz stol): filialdagi buyurtma oluvchilarga; boshqa filial, oshpaz, egasi ko\'rmaydi; push — o\'shalarga', async () => {
    await call(table5, 'waiter');
    expect(await kindsOf('ali')).toEqual(['waiterCall:5']);
    expect(await kindsOf('vali')).toEqual(['waiterCall:5']);
    expect(await kindsOf('kassir')).toEqual(['waiterCall:5']);
    // Oshpazning shaxsiy ro'yxatida order.create bor, lekin roli ustun — rolida yo'q
    expect(await kindsOf('oshpaz')).toEqual([]);
    expect(await kindsOf('boshqa')).toEqual([]);
    expect(await kindsOf('admin')).toEqual([]);
    expect(h.push).toHaveLength(1);
    expect(h.push[0]).toMatchObject({ dbName: 'test', userIds: [ids.ali, ids.kassir, ids.vali].sort(), title: 'Ofitsant chaqirilmoqda', body: '5-stol ofitsantni chaqiryapti', url: '/app/tables' });
    const n = (await list('ali')).items[0];
    expect(n).toMatchObject({ read: false, handled: false, url: '/app/tables', title: 'Ofitsant chaqirilmoqda' });
    // Ruscha ko'rinish — ko'ruvchi tilida
    const ru = (await import('@/lib/i18n/dict')).getDictionary('ru');
    const ruList = await notifyLib.listNotifications('test', viewers.ali().v, viewers.ali().p, ru);
    expect(ruList.items[0].body).toBe('Стол 5 зовёт официанта');
  });

  it('takrorlanmaslik: 2 daqiqada qayta bosish — bitta xabar; «Ko\'rdim» dan keyin — darhol yangi; oyna o\'tgach — yangi', async () => {
    await call(table5, 'waiter');
    expect((await list('ali')).items).toHaveLength(1);
    expect(h.push).toHaveLength(0);
    // Ofitsant «Ko'rdim» — xabar hammada o'qilgan (hal qilingan), keyingi chaqiruv darhol keladi
    expect(await ops.ackTableCall(vali, table5, 'waiter')).toMatchObject({ ok: true });
    const afterAck = await list('ali');
    expect(afterAck.unread).toBe(0);
    expect(afterAck.items[0]).toMatchObject({ read: true, handled: true });
    await call(table5, 'waiter');
    expect((await list('ali')).items).toHaveLength(2);
    expect((await list('ali')).unread).toBe(1);
    // Vaqt oynasi (2 daqiqa) o'tgach — «Ko'rdim»siz ham yangi
    const later = new Date(Date.now() + 3 * 60_000);
    const r = await notifyLib.createNotification(ORG, {
      kind: 'waiterCall', branchId: String(branchA), params: { table: 5 }, url: '/app/tables',
      audience: { anyPermission: ['order.create'] }, dedupeKey: `waiterCall:${table5}`,
    }, { now: later });
    expect(r.created).toBe(true);
    const dup = await notifyLib.createNotification(ORG, {
      kind: 'waiterCall', branchId: String(branchA), params: { table: 5 }, audience: { anyPermission: ['order.create'] }, dedupeKey: `waiterCall:${table5}`,
    }, { now: new Date(later.getTime() + 1000) });
    expect(dup).toMatchObject({ created: false, reason: 'duplicate' });
    // Parallel ikki so'rov — bitta xabar (noyob dedupeSlot)
    const both = await Promise.all([1, 2].map(() => notifyLib.createNotification(ORG, {
      kind: 'billCall', branchId: String(branchA), params: { table: 6 }, audience: { anyPermission: ['order.create'] }, dedupeKey: `billCall:${table6}`,
    })));
    expect(both.filter((x) => x.created)).toHaveLength(1);
    await notifyLib.settleNotifications();
    await m.Notification.deleteMany({});
  });

  it('ofitsanti bor stol: chaqiruv faqat o\'sha ofitsantga; hisob so\'rovi — unga va kassirga (boshqa ofitsant ko\'rmaydi)', async () => {
    const opened = await ops.openOrder(ali, { type: 'dine_in', tableId: table6 });
    expect(opened.ok).toBe(true);
    await call(table6, 'waiter');
    expect(await kindsOf('ali')).toEqual(['waiterCall:6']);
    expect(await kindsOf('vali')).toEqual([]);
    expect(await kindsOf('kassir')).toEqual([]);
    expect(h.push[0].userIds).toEqual([ids.ali]);

    await call(table6, 'bill');
    expect(await kindsOf('ali')).toEqual(['billCall:6', 'waiterCall:6']);
    expect(await kindsOf('kassir')).toEqual(['billCall:6']);
    expect(await kindsOf('vali')).toEqual([]);
    expect(h.push[1].userIds).toEqual([ids.ali, ids.kassir].sort());
    // Kassir hisob so'rovini «Ko'rdim» — ofitsantda ham hal qilingan; ofitsant chaqiruvi ochiq qoladi
    expect(await ops.ackTableCall(kassir, table6, 'bill')).toMatchObject({ ok: true });
    const a = await list('ali');
    expect(a.unread).toBe(1);
    expect(a.items.find((i) => i.kind === 'billCall')).toMatchObject({ handled: true, read: true });
  });

  it('o\'qildi belgisi: bittasi va hammasi; boshqaning xabarini belgilab bo\'lmaydi; `after` va `limit`', async () => {
    const aliList = await list('ali');
    const waiterCall = aliList.items.find((i) => i.kind === 'waiterCall' && !i.read)!;
    // Vali bu xabarni ko'rmaydi — belgilay olmaydi
    const vv = viewers.vali();
    expect(await notifyLib.markNotificationsRead('test', vv.v, vv.p, { id: waiterCall.id })).toMatchObject({ found: false });
    // Noto'g'ri id — topilmadi; filialsiz xodim — hech narsa
    expect(await notifyLib.markNotificationsRead('test', vv.v, vv.p, { id: 'zzz' })).toMatchObject({ found: false });
    expect(notifyLib.visibleFilter({ id: ids.vali, role: 'user' }, new Set(WAITER))).toEqual({ _id: { $in: [] } });

    const av = viewers.ali();
    expect(await notifyLib.markNotificationsRead('test', av.v, av.p, { id: waiterCall.id })).toMatchObject({ found: true, updated: 1, unread: 0 });
    // Takror — zararsiz
    expect(await notifyLib.markNotificationsRead('test', av.v, av.p, { id: waiterCall.id })).toMatchObject({ found: true, updated: 0 });
    expect((await list('ali')).items.every((i) => i.read)).toBe(true);

    await call(table5, 'bill');
    expect((await list('vali')).unread).toBe(1);
    expect((await list('kassir')).unread).toBe(1);
    const kv = viewers.kassir();
    expect(await notifyLib.markNotificationsRead('test', kv.v, kv.p, { all: true })).toMatchObject({ unread: 0 });
    // Kassir o'qigani valiga ta'sir qilmaydi (o'qildi — foydalanuvchi bo'yicha)
    expect((await list('vali')).unread).toBe(1);

    const all = await list('kassir');
    const newest = all.items[0].createdAt;
    const onlyNew = await list('kassir', { after: newest });
    expect(onlyNew.items.map((i) => i.id)).toEqual([all.items[0].id]);
    const count = await list('vali', { limit: 0 });
    expect(count).toMatchObject({ items: [], unread: 1 });
  });

  it('hech kim mos kelmasa (xodimsiz filial) — egasiga; boshqa filial xodimlari ko\'rmaydi', async () => {
    await call(tableC, 'waiter');
    expect(await kindsOf('admin')).toEqual(['waiterCall:1']);
    expect(await kindsOf('boshqa')).not.toContain('waiterCall:1');
    expect(h.push[0].userIds).toEqual([ids.admin]);
    // Nofaol (ishdan ketgan) ofitsant — oluvchi emas, xabar egasiga o'tadi
    const r = await notifyLib.createNotification(ORG, { kind: 'waiterCall', branchId: String(branchA), params: { table: 9 }, audience: { userIds: [ids.ketgan] } });
    expect(r).toMatchObject({ created: true, recipients: [ids.admin] });
    expect(await kindsOf('admin')).toContain('waiterCall:9');
    await notifyLib.settleNotifications();
    await m.Notification.deleteMany({});
  });

  it('kam qoldiq va taomga oz porsiya: chegarani kesib o\'tganda bir marta, «tugadi» alohida; porsiya — Menyu bilan bir xil', async () => {
    const order = await ops.openOrder(vali, { type: 'takeaway' });
    expect(order.ok).toBe(true);
    const orderId = order.ok ? order.data.order.id : '';
    const send = async (productId: string, qty: number) => {
      expect((await ops.addItems(vali, orderId, [{ productId, qty }])).ok).toBe(true);
      const r = await ops.sendItems(vali, orderId);
      await notifyLib.settleNotifications();
      return r;
    };
    // Go'sht 4 kg (min 2): 1 Osh → 3,5 kg — chegaradan yuqori, porsiya 7 > 5 — xabar yo'q
    expect((await send(P.osh, 1)).ok).toBe(true);
    expect(await kindsOf('admin')).toEqual([]);
    expect(h.push).toHaveLength(0);

    // 2 Osh → 2,5 kg: hali ≥ 2, lekin porsiya 5 ≤ 5 — «kam qoldi»
    expect((await send(P.osh, 2)).ok).toBe(true);
    expect(await kindsOf('admin')).toEqual(['dishLow:Osh']);
    const menuView = await menu.menuAdminView(admin, { branchId: String(branchA) });
    const oshRow = menuView.ok ? menuView.data.items.find((i) => i.name === 'Osh') : null;
    expect((await list('admin')).items[0].params.portions).toBe(oshRow?.portions);
    expect((await list('admin')).items[0]).toMatchObject({ title: 'Kam qoldi: Osh', body: 'Xom ashyo yana 5 porsiyaga yetadi · Chilonzor', url: '/app/menu' });

    // 1 Osh → 2,0 kg: hali minimaldan kam EMAS (2 < 2 — yo'q); porsiya 4 — «kam qoldi» takrorlanmaydi
    expect((await send(P.osh, 1)).ok).toBe(true);
    expect(await kindsOf('admin')).toEqual(['dishLow:Osh']);

    // 1 Osh → 1,5 kg < 2 — minimal qoldiqdan tushdi (bir marta)
    expect((await send(P.osh, 1)).ok).toBe(true);
    const low = (await list('admin')).items.find((i) => i.kind === 'lowStock')!;
    expect(low).toMatchObject({ params: { product: "Go'sht", qty: 1.5, unit: 'kg', min: 2 }, url: '/app/products?low=1' });
    expect(low.title).toBe("Kam qoldi: Go'sht");
    expect(low.body).toBe('Omborda 1,5 kg qoldi (minimal — 2 kg) · Chilonzor');
    // Kimga: egasi + filialdagi product.edit; ofitsant, boshqa filial — yo'q
    expect(await kindsOf('menyuchi')).toEqual(["lowStock:Go'sht", 'dishLow:Osh']);
    expect(await kindsOf('vali')).toEqual([]);
    expect(await kindsOf('boshqa')).toEqual([]);
    expect(h.push.find((x) => x.title === "Kam qoldi: Go'sht")?.userIds).toEqual([ids.admin, ids.menyuchi].sort());

    // Yana 1 → 1,0 kg: kam qoldiq takrorlanmaydi (12 soat)
    expect((await send(P.osh, 1)).ok).toBe(true);
    expect((await list('admin')).items.filter((i) => i.kind === 'lowStock')).toHaveLength(1);

    // 2 Osh → 0 kg: «tugadi» — alohida xabar
    expect((await send(P.osh, 2)).ok).toBe(true);
    const out = (await list('admin')).items.filter((i) => i.kind === 'dishLow');
    expect(out.map((i) => i.params.portions)).toEqual([0, 5]);
    expect(out[0]).toMatchObject({ title: 'Tugadi: Osh' });
  });

  it('tayyor tovar (Cola) menyuda: qoldiq ≤ chegara — «kam qoldi»; sozlama 0 — o\'chiq', async () => {
    const r = await setup.saveRestaurantSettings(admin, { lowPortions: 0 });
    expect(r.ok && r.data.lowPortions).toBe(0);
    expect(await setup.saveRestaurantSettings(admin, { lowPortions: -1 })).toMatchObject({ ok: false, code: 'badSettings' });
    const order = await ops.openOrder(vali, { type: 'takeaway' });
    const orderId = order.ok ? order.data.order.id : '';
    await ops.addItems(vali, orderId, [{ productId: P.cola, qty: 3 }]);
    await ops.sendItems(vali, orderId);
    await notifyLib.settleNotifications();
    expect((await list('admin')).items.filter((i) => i.params.dish === 'Cola')).toHaveLength(0);

    await setup.saveRestaurantSettings(admin, { lowPortions: 5 });
    await ops.addItems(vali, orderId, [{ productId: P.cola, qty: 1 }]);
    await ops.sendItems(vali, orderId);
    await notifyLib.settleNotifications();
    const cola = (await list('admin')).items.filter((i) => i.params.dish === 'Cola');
    expect(cola.map((i) => i.params.portions)).toEqual([3]);
  });

  it('xato kiritish: noma\'lum tur, tashqi url, yaroqsiz parametrlar — xavfsiz', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await notifyLib.createNotification(ORG, { kind: 'hack' as any, params: {}, audience: { admins: true } })).toMatchObject({ created: false, reason: 'invalid' });
    const r = await notifyLib.createNotification(ORG, {
      kind: 'reservationSoon', params: { table: 5, time: '19:30', name: 'Aziz', guests: 4, $where: 'x', obj: { a: 1 } as unknown as string },
      url: '//evil.example/x', audience: { admins: true, anyPermission: ['nope' as PK] },
    });
    expect(r.created).toBe(true);
    const doc = await m.Notification.findById(r.id).lean();
    expect(doc.url).toBeUndefined();
    expect(doc.params).toEqual({ table: 5, time: '19:30', name: 'Aziz', guests: 4 });
    expect(doc.audience.anyPermission).toEqual([]);
    const n = (await list('admin')).items.find((i) => i.id === r.id)!;
    expect(n).toMatchObject({ title: 'Bron yaqinlashdi: 19:30', body: '5-stol — Aziz, 4 kishi', url: null });
    // notify() hech qachon xato tashlamaydi
    await expect(notifyLib.notify({ id: 'x', dbName: '' }, { kind: 'waiterCall', params: {}, audience: {} })).resolves.toBeUndefined();
    await notifyLib.settleNotifications();
  });
});
