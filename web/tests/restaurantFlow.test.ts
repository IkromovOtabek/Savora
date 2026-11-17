/**
 * Restoran oqimi — haqiqiy MongoDB bilan (MONGO_TEST_URI berilsa):
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/restaurantFlow.test.ts
 * Stol ochish → taom (modifikator, idempotent) → oshxonaga (ombor/texkarta band) → KDS → bekor qilish
 * (ombor qaytadi / yo'qotish) → pre-chek → qayta ochish → hisobni bo'lish → to'lov (Sale qatorlari, xizmat
 * haqi, kassa smenasi) → stol bo'shaydi; saboy (qadoq), mijoz QR (pending → tasdiq), parallel so'rovlar.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';

vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock('@/lib/onboarding', () => ({ markOnboardingStep: vi.fn(async () => {}) }));
vi.mock('@/lib/shopNotify', () => ({ notifyNewSale: vi.fn(async () => {}), salePayLabel: () => 'naqd' }));

const URI = process.env.MONGO_TEST_URI;

describe.skipIf(!URI)('restoran oqimi (MongoDB)', () => {
  let conn: mongoose.Connection;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any;
  let ops: typeof import('@/lib/restaurant/ops');
  let setup: typeof import('@/lib/restaurant/setup');
  let queries: typeof import('@/lib/restaurant/queries');
  let pub: typeof import('@/lib/restaurant/public');
  let d: import('@/lib/i18n/dict').Dict;
  let features: import('@/lib/features').OrgFeatures;
  type PK = import('@/lib/permissions').PermissionKey;

  const branchId = new Types.ObjectId();
  const otherBranch = new Types.ObjectId();
  const ids = {
    admin: new Types.ObjectId().toString(),
    ali: new Types.ObjectId().toString(),
    vali: new Types.ObjectId().toString(),
    chef: new Types.ObjectId().toString(),
    kassir: new Types.ObjectId().toString(),
  };
  const user = (id: string, username: string, role: 'admin' | 'user' = 'user') =>
    ({ id, username, role, tokenVersion: 0, dbName: 'test', organizationId: 'org', ...(role === 'user' ? { branchId: String(branchId) } : {}) });
  const WAITER: PK[] = ['order.create', 'tasks.view'];
  const CHEF: PK[] = ['kitchen.view', 'kitchen.bump', 'menu.stopList'];
  const CASHIER: PK[] = ['sale.create', 'order.create', 'order.viewAll', 'order.split'];
  let ADMIN: PK[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (u: ReturnType<typeof user>, perms: PK[]): any => ({ user: u, orgId: 'a'.repeat(24), orgSlug: 'osh-markazi', m, perms: new Set(perms), features, d });
  let admin: ReturnType<typeof ctx>, ali: ReturnType<typeof ctx>, vali: ReturnType<typeof ctx>, chef: ReturnType<typeof ctx>, kassir: ReturnType<typeof ctx>;

  const P: Record<string, string> = {};
  let kitchenId: string, barId: string, hallId: string, table5: string, table6: string, table7: string;
  let optKatta: string, optKichik: string;

  beforeAll(async () => {
    conn = await mongoose.createConnection(`${URI}/savora_rest_test_${Date.now()}`).asPromise();
    const s = {
      Order: (await import('@/lib/models/tenant/Order')).orderSchema,
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
    queries = await import('@/lib/restaurant/queries');
    pub = await import('@/lib/restaurant/public');
    d = (await import('@/lib/i18n/dict')).getDictionary('uz');
    const { resolveOrgFeatures } = await import('@/lib/features');
    const { PERMISSION_KEYS } = await import('@/lib/permissions');
    features = resolveOrgFeatures({ plan: { tier: 'pro', maxFilial: 3, maxUsers: 10 }, businessType: 'restaurant' });
    ADMIN = [...PERMISSION_KEYS];
    admin = ctx(user(ids.admin, 'egasi', 'admin'), ADMIN);
    ali = ctx(user(ids.ali, 'ali'), WAITER);
    vali = ctx(user(ids.vali, 'vali'), WAITER);
    chef = ctx(user(ids.chef, 'oshpaz'), CHEF);
    kassir = ctx(user(ids.kassir, 'kassir'), CASHIER);

    await m.Branch.create([{ _id: branchId, name: 'Chilonzor', active: true }, { _id: otherBranch, name: 'Yunusobod', active: true }]);
    await m.User.create([
      { _id: ids.ali, username: 'ali', password: 'x', role: 'user', branchId, active: true },
      { _id: ids.vali, username: 'vali', password: 'x', role: 'user', branchId, active: true },
    ]);
    await m.ShopSettings.create({ key: 'main', restaurant: { serviceChargePct: 10, takeawayPackFee: 2000, requireVoidReason: true } });

    // Sozlamalar: zal, stollar, stansiyalar
    const hall = await setup.saveHall(admin, { name: 'Asosiy zal', branchId: String(branchId) });
    expect(hall.ok).toBe(true);
    hallId = hall.ok ? hall.data.id : '';
    const range = await setup.createTablesRange(admin, { hallId, from: 5, to: 7, seats: 4 });
    expect(range).toMatchObject({ ok: true, data: { created: 3, skipped: [] } });
    const tables = await m.Table.find({ branchId }).sort({ number: 1 }).lean();
    [table5, table6, table7] = tables.map((t: { _id: unknown }) => String(t._id));
    const k = await setup.saveStation(admin, { name: 'Issiq sex', kind: 'kitchen', branchId: String(branchId) });
    const b = await setup.saveStation(admin, { name: 'Bar', kind: 'bar', branchId: String(branchId) });
    kitchenId = k.ok ? k.data.id : '';
    barId = b.ok ? b.data.id : '';

    // Menyu: texkarta (bundle) + tarkibi, shisha ichimlik, stansiyasiz non, stop-listdagi somsa
    const mk = (over: Record<string, unknown>) => m.Product.create({
      imei: `P${Math.random().toString(36).slice(2, 10)}`, purchasePrice: 1000, salePrice: 1000, branchId, status: 'in_stock', ...over,
    });
    const gosht = await mk({ name: "Go'sht", unit: 'kg', trackQuantity: true, quantity: 10, purchasePrice: 90000 });
    const guruch = await mk({ name: 'Guruch', unit: 'kg', trackQuantity: true, quantity: 20, purchasePrice: 15000 });
    const osh = await mk({
      name: 'Osh', kind: 'bundle', salePrice: 45000, purchasePrice: 22500,
      bundleItems: [{ productId: gosht._id, qty: 0.2 }, { productId: guruch._id, qty: 0.3 }],
    });
    const cola = await mk({ name: 'Cola', trackQuantity: true, quantity: 2, salePrice: 10000, purchasePrice: 6000 });
    const non = await mk({ name: 'Non', kind: 'service', salePrice: 3000, purchasePrice: 0 });
    const somsa = await mk({ name: 'Somsa', trackQuantity: true, quantity: 5, salePrice: 8000 });
    Object.assign(P, { gosht: String(gosht._id), guruch: String(guruch._id), osh: String(osh._id), cola: String(cola._id), non: String(non._id), somsa: String(somsa._id) });

    expect((await setup.updateMenuItem(admin, P.osh, {
      stationId: kitchenId,
      modifierGroups: [{ name: 'Porsiya', required: true, options: [{ name: 'Kichik', price: 0 }, { name: 'Katta', price: 8000 }] }],
      ikpu: '10202001001000000',
    })).ok).toBe(true);
    expect((await setup.updateMenuItem(admin, P.cola, { stationId: barId })).ok).toBe(true);
    expect((await setup.updateMenuItem(admin, P.somsa, { stationId: kitchenId })).ok).toBe(true);
    expect((await setup.setStopList(chef, P.somsa, true)).ok).toBe(true);
    const oshDoc = await m.Product.findById(P.osh).lean();
    optKichik = String(oshDoc.modifierGroups[0].options[0]._id);
    optKatta = String(oshDoc.modifierGroups[0].options[1]._id);
    expect(oshDoc.ikpu).toBe('10202001001000000');
  });

  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  const stock = async (id: string) => (await m.Product.findById(id).lean()).soldQuantity;

  it('sozlamalar: stol raqami noyob, zal stollari bilan o\'chmaydi, QR almashadi', async () => {
    expect(await setup.saveTable(admin, { hallId, number: 5 })).toMatchObject({ ok: false, code: 'tableNumberTaken' });
    expect(await setup.deleteHall(admin, hallId)).toMatchObject({ ok: false, code: 'hallHasTables' });
    const before = (await m.Table.findById(table7).lean()).qrToken;
    const r = await setup.regenerateTableQr(admin, table7);
    expect(r.ok && r.data.qrToken !== before && r.data.qrPath === `/m/osh-markazi/${r.data.qrToken}`).toBe(true);
    // Ofitsantda tables.manage yo'q
    expect(await setup.saveHall(ali, { name: 'X' })).toMatchObject({ ok: false, code: 'noPermission' });
    expect(await setup.saveRestaurantSettings(admin, { brand: { logoUrl: 'https://evil.example/x.png' } })).toMatchObject({ ok: false, code: 'badUrl' });
    expect(await setup.saveRestaurantSettings(admin, { kdsWarnMinutes: 30, kdsAlertMinutes: 20 })).toMatchObject({ ok: false, code: 'badSettings' });
  });

  it('asosiy oqim: stol → taom → oshxona → KDS → bekor → pre-chek → bo\'lib to\'lash → yopish', async () => {
    // 1) Stol ochish; ikkinchi ofitsant band stolni ocholmaydi, o'zi qayta ochsa — o'sha buyurtma
    const opened = await ops.openOrder(ali, { type: 'dine_in', tableId: table5, guests: 3 });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const orderId = opened.data.order.id;
    expect(opened.data.order).toMatchObject({ tableNumber: 5, serviceChargePct: 10, waiterName: 'ali', status: 'open' });
    expect(await ops.openOrder(vali, { type: 'dine_in', tableId: table5 })).toMatchObject({ ok: false, code: 'tableBusy' });
    expect(await ops.openOrder(ali, { type: 'dine_in', tableId: table5 })).toMatchObject({ ok: true, data: { existing: true } });
    expect(await queries.getOrder(vali, orderId)).toMatchObject({ ok: false, code: 'orderNotFound' });

    // 2) Taom qo'shish: modifikator narxi, majburiy guruh, stop-list, idempotent clientItemId
    expect(await ops.addItems(ali, orderId, [{ productId: P.osh, qty: 1 }])).toMatchObject({ ok: false, code: 'badModifiers' });
    expect(await ops.addItems(ali, orderId, [{ productId: P.somsa, qty: 1 }])).toMatchObject({ ok: false, code: 'stopListed' });
    const items = [
      { clientItemId: 'c-osh-000001', productId: P.osh, qty: 2, optionIds: [optKatta], note: 'piyozsiz' },
      { clientItemId: 'c-cola-00001', productId: P.cola, qty: 1 },
      { clientItemId: 'c-non-000001', productId: P.non, qty: 2 },
    ];
    const added = await ops.addItems(ali, orderId, items);
    expect(added.ok && added.data.added.length).toBe(3);
    const again = await ops.addItems(ali, orderId, items);
    expect(again.ok && again.data).toMatchObject({ added: [], duplicates: ['c-osh-000001', 'c-cola-00001', 'c-non-000001'] });
    const order1 = again.ok ? again.data.order : null;
    const oshItem = order1!.items.find((i) => i.name === 'Osh')!;
    expect(oshItem).toMatchObject({ price: 53000, total: 106000, displayName: 'Osh (Katta)', stationId: kitchenId, status: 'new' });

    // 3) Oshxonaga yuborish: texkarta tarkibi band, stansiyasiz non — darhol berildi; parallel yuborish — bir marta
    const [s1, s2] = await Promise.all([ops.sendItems(ali, orderId), ops.sendItems(ali, orderId)]);
    const sentOk = [s1, s2].filter((r) => r.ok);
    expect(sentOk.length).toBeGreaterThanOrEqual(1);
    expect(await stock(P.gosht)).toBeCloseTo(0.4);
    expect(await stock(P.guruch)).toBeCloseTo(0.6);
    expect(await stock(P.cola)).toBe(1);
    const afterSend = await queries.getOrder(ali, orderId);
    const st = Object.fromEntries(afterSend.ok ? afterSend.data.order.items.map((i) => [i.name, i.status]) : []);
    expect(st).toEqual({ Osh: 'sent', Cola: 'sent', Non: 'served' });

    // 4) Ombor yetmasa — yuborilmaydi, sabab qaytadi
    await ops.addItems(ali, orderId, [{ productId: P.cola, qty: 2 }]);
    const short = await ops.sendItems(ali, orderId);
    expect(short).toMatchObject({ ok: false, code: 'sendFailed' });
    expect(!short.ok && (short.details?.failed as { reason: string }[])[0].reason).toBe('outOfStock');
    const unsentCola = (await m.Order.findById(orderId).lean()).items.find((i: { name: string; status: string }) => i.name === 'Cola' && i.status === 'new');
    expect(await ops.voidItem(ali, orderId, { itemId: String(unsentCola._id) })).toMatchObject({ ok: true, data: { stockReleased: false, loss: false } });

    // 5) KDS: oshpaz boshlaydi/tayyor; ofitsant — yetkazildi; vaqt belgilari
    const board = await queries.kitchenBoard(chef, { branchId: String(branchId), stationId: kitchenId });
    expect(board.ok && board.data.orders.length).toBe(1);
    expect(board.ok && board.data.orders[0].items.map((i) => i.name)).toEqual(['Osh']);
    expect(await ops.bumpItems(ali, orderId, { itemIds: [oshItem.id], to: 'cooking' })).toMatchObject({ ok: false, code: 'noPermission' });
    expect((await ops.bumpItems(chef, orderId, { itemIds: [oshItem.id], to: 'cooking' })).ok).toBe(true);
    expect((await ops.bumpItems(chef, orderId, { itemIds: [oshItem.id], to: 'ready' })).ok).toBe(true);
    const served = await ops.bumpItems(ali, orderId, { itemIds: [oshItem.id], to: 'served' });
    expect(served.ok).toBe(true);
    const oshServed = served.ok ? served.data.order.items.find((i) => i.id === oshItem.id)! : null;
    expect(oshServed!.timings.prepMs).not.toBeNull();
    expect(oshServed!.timings.deliveryMs).not.toBeNull();
    expect(await ops.bumpItems(chef, orderId, { itemIds: [oshItem.id], to: 'cooking' })).toMatchObject({ ok: false, code: 'badTransition' });

    // 6) Bekor qilish: yuborilgan, boshlanmagan — ombor qaytadi (huquq + sabab)
    const colaSent = served.ok ? served.data.order.items.find((i) => i.name === 'Cola' && i.status === 'sent')! : null;
    expect(await ops.voidItem(ali, orderId, { itemId: colaSent!.id, reason: 'xato' })).toMatchObject({ ok: false, code: 'noPermission' });
    expect(await ops.voidItem(admin, orderId, { itemId: colaSent!.id })).toMatchObject({ ok: false, code: 'voidReasonRequired' });
    expect(await ops.voidItem(admin, orderId, { itemId: colaSent!.id, reason: 'Mijoz voz kechdi' })).toMatchObject({ ok: true, data: { stockReleased: true, loss: false } });
    expect(await stock(P.cola)).toBe(0);

    // 7) Tayyorlash boshlangan taom bekor — ombor qaytmaydi (yo'qotish)
    const extra = await ops.addItems(ali, orderId, [{ productId: P.osh, qty: 1, optionIds: [optKichik] }]);
    const extraId = extra.ok ? extra.data.added[0] : '';
    await ops.sendItems(ali, orderId, [extraId]);
    await ops.bumpItems(chef, orderId, { itemIds: [extraId], to: 'cooking' });
    const goshtBefore = await stock(P.gosht);
    expect(await ops.voidItem(admin, orderId, { itemId: extraId, reason: 'kuyib ketdi' })).toMatchObject({ ok: true, data: { stockReleased: false, loss: true } });
    expect(await stock(P.gosht)).toBeCloseTo(goshtBefore);

    // 8) Pre-chek qulflaydi; qayta ochish — faqat order.reopen
    const pre = await ops.precheckOrder(ali, orderId);
    expect(pre).toMatchObject({ ok: true, data: { order: { status: 'precheck' } } });
    expect(await ops.addItems(ali, orderId, [{ productId: P.non, qty: 1 }])).toMatchObject({ ok: false, code: 'orderLocked' });
    expect(await ops.reopenOrder(ali, orderId)).toMatchObject({ ok: false, code: 'noPermission' });
    expect(await ops.reopenOrder(admin, orderId)).toMatchObject({ ok: true, data: { order: { status: 'open' } } });
    expect((await ops.precheckOrder(ali, orderId)).ok).toBe(true);

    // 9) Hisobni bo'lish: 2 ta oshdan 1 tasi — qator ikkiga bo'linadi; xizmat haqi shu qismdan
    expect(await ops.payOrder(ali, orderId, { items: [{ itemId: oshItem.id, qty: 1 }], parts: [{ method: 'cash', amount: 60000 }] }))
      .toMatchObject({ ok: false, code: 'noPermission' });
    const part = await ops.payOrder(kassir, orderId, { items: [{ itemId: oshItem.id, qty: 1 }], parts: [{ method: 'cash', amount: 50000 }] });
    expect(part).toMatchObject({ ok: false, code: 'underpaid' });
    const goshtBeforePay = await stock(P.gosht);
    const p1 = await ops.payOrder(kassir, orderId, { items: [{ itemId: oshItem.id, qty: 1 }], parts: [{ method: 'cash', amount: 58300 }], payId: 'pay-part-0001' });
    expect(p1.ok).toBe(true);
    if (!p1.ok) return;
    expect(p1.data).toMatchObject({ total: 58300, change: 0, closed: false });
    // Takroriy bosish — avvalgi natija, ikkinchi sotuv yo'q
    const p1b = await ops.payOrder(kassir, orderId, { items: [{ itemId: oshItem.id, qty: 1 }], parts: [{ method: 'cash', amount: 58300 }], payId: 'pay-part-0001' });
    expect(p1b.ok && p1b.data.checkoutId).toBe(p1.data.checkoutId);
    const sales1 = await m.Sale.find({ checkoutId: p1.data.checkoutId }).lean();
    expect(sales1.map((s: { productSnapshot: { name: string } }) => s.productSnapshot.name).sort()).toEqual(['Osh (Katta)', 'Xizmat haqi (10%)']);
    expect(sales1.every((s: { soldBy: string; tableNumber: number; orderId: unknown; status: string }) => s.soldBy === 'ali' && s.tableNumber === 5 && String(s.orderId) === orderId && s.status === 'paid')).toBe(true);

    // 10) Qolganini to'lash: aralash usul, qaytim; ombor qayta band qilinmaydi; stol bo'shaydi
    const bill = (await queries.getOrder(kassir, orderId)) as { ok: true; data: { order: { bill: { due: number } } } };
    const due = bill.data.order.bill.due; // 1 osh (53000) + 2 non (6000) + 10% = 64900
    expect(due).toBe(64900);
    const p2 = await ops.payOrder(kassir, orderId, { parts: [{ method: 'uzqr', amount: 40000 }, { method: 'cash', amount: 30000 }] });
    expect(p2).toMatchObject({ ok: true, data: { total: 64900, change: 5100, closed: true } });
    expect(await stock(P.gosht)).toBeCloseTo(goshtBeforePay);
    const closed = await m.Order.findById(orderId).lean();
    expect(closed.status).toBe('paid');
    expect(closed.activeTableKey).toBeUndefined();
    expect(closed.items.filter((i: { paidCheckoutId?: string; status: string }) => i.status !== 'voided').every((i: { paidCheckoutId?: string; saleId?: unknown }) => i.paidCheckoutId && i.saleId)).toBe(true);
    const all = await m.Sale.find({ orderId }).lean();
    const sum = all.reduce((s: number, x: { totalAmount: number }) => s + x.totalAmount, 0);
    expect(sum).toBe(58300 + 64900);
    // Kassa smenasi: naqd — 58300 + (30000 − 5100 qaytim), UzQR — karta/QR qatorida
    const { computeShiftTotals } = await import('@/lib/cashShift');
    const t = computeShiftTotals(all, [], 0, new Date(Date.now() - 3600_000), new Date(Date.now() + 60_000));
    expect(t.cashIn).toBe(58300 + 24900);
    expect(t.cardIn).toBe(40000);
    // Stol bo'sh — yangi buyurtma ochiladi
    const next = await ops.openOrder(vali, { type: 'dine_in', tableId: table5 });
    expect(next).toMatchObject({ ok: true, data: { existing: false } });
  });

  it('saboy: xizmat haqi 0, qadoq haqi bir marta; to\'lovda yuborilmagan taom avtomatik yuboriladi', async () => {
    const o = await ops.openOrder(kassir, { type: 'takeaway', items: [{ productId: P.osh, qty: 1, optionIds: [optKichik] }] });
    expect(o).toMatchObject({ ok: true, data: { order: { type: 'takeaway', serviceChargePct: 0, packFee: 2000 } } });
    if (!o.ok) return;
    const paid = await ops.payOrder(kassir, o.data.order.id, { parts: [{ method: 'cash', amount: 47000 }] });
    expect(paid).toMatchObject({ ok: true, data: { total: 47000, closed: true } });
    const sales = await m.Sale.find({ orderId: o.data.order.id }).lean();
    expect(sales.map((s: { productSnapshot: { name: string; imei: string } }) => s.productSnapshot.imei).sort()).toContain('QADOQ');
    // To'langan, lekin hali tayyorlanayotgan — KDS'da ko'rinadi
    const board = await queries.kitchenBoard(chef, { branchId: String(branchId) });
    expect(board.ok && board.data.orders.some((x) => x.id === o.data.order.id && x.items[0].status === 'sent')).toBe(true);
    // Tizim xizmat mahsuloti ro'yxatlarda ko'rinmaydi (soft-delete)
    expect(await m.Product.countDocuments({ systemKey: { $exists: true } })).toBe(0);
    expect(await m.Product.countDocuments({ systemKey: { $exists: true } }).setOptions({ withDeleted: true })).toBe(2);
  });

  it('mijoz QR: taomlar pending, takroriy yuborish yozilmaydi, ofitsant tasdiqlaydi, chaqiruv', async () => {
    const tbl = await m.Table.findById(table6).lean();
    const c = { org: { id: 'a'.repeat(24), name: 'Osh markazi', slug: 'osh-markazi', dbName: 'test' }, m, table: tbl, d };
    const menu = await pub.publicMenu(c);
    expect(menu.items.find((i) => i.name === 'Somsa')).toBeUndefined(); // stop-list
    expect(menu.items.find((i) => i.name === 'Osh')).toBeDefined();
    expect(JSON.stringify(menu)).not.toMatch(/purchasePrice|soldQuantity|stationId/);

    const input = { clientOrderId: 'qr-client-0001', items: [{ productId: P.osh, qty: 2, optionIds: [optKatta], note: '' }] };
    const r1 = await pub.publicPlaceOrder(c, input);
    expect(r1).toMatchObject({ ok: true, data: { added: 1 } });
    const r2 = await pub.publicPlaceOrder(c, input);
    expect(r2).toMatchObject({ ok: true, data: { added: 0 } });
    const order = await m.Order.findOne({ activeTableKey: table6 }).lean();
    expect(order).toMatchObject({ type: 'qr_self', source: 'qr', serviceChargePct: 0 });
    expect(order.items[0].status).toBe('pending');
    expect(order.waiterId).toBeUndefined();
    const goshtBefore = await stock(P.gosht);
    // Pending taom bilan to'lov/pre-chek — rad
    expect(await ops.precheckOrder(vali, String(order._id))).toMatchObject({ ok: false, code: 'pendingItems' });
    const conf = await ops.confirmPendingItems(vali, String(order._id), { send: true });
    expect(conf).toMatchObject({ ok: true, data: { order: { waiterName: 'vali' } } });
    expect(conf.ok && conf.data.sent?.length).toBe(1);
    expect(await stock(P.gosht)).toBeCloseTo(goshtBefore + 0.4);
    // Endi ali (boshqa ofitsant) bu buyurtmani ko'rmaydi
    expect(await queries.getOrder(ali, String(order._id))).toMatchObject({ ok: false, code: 'orderNotFound' });

    await pub.publicCall(c, 'bill');
    const board = await queries.tablesBoard(vali, {});
    const row = board.ok ? board.data.tables.find((t) => t.id === table6) : null;
    expect(row?.calls.billAt).toBeTruthy();
    expect(row?.order).toMatchObject({ access: true, mine: true });
    await ops.ackTableCall(vali, table6, 'bill');
    expect((await m.Table.findById(table6).lean()).callBillAt).toBeUndefined();
    const status = await pub.publicOrderStatus(c);
    expect(status.items[0]).toMatchObject({ name: 'Osh (Katta)', qty: 2, status: 'sent' });
  });

  it('o\'tkazish va bekor qilish: band stolga o\'tmaydi, yuborilgan taom bilan bekor bo\'lmaydi', async () => {
    const o = await ops.openOrder(ali, { type: 'dine_in', tableId: table7, items: [{ productId: P.non, qty: 1 }] });
    if (!o.ok) throw new Error(o.error);
    const id = o.data.order.id;
    expect(await ops.transferOrder(ali, id, { tableId: table6 })).toMatchObject({ ok: false, code: 'noPermission' });
    expect(await ops.transferOrder(admin, id, { tableId: table6 })).toMatchObject({ ok: false, code: 'tableBusy' });
    expect(await ops.transferOrder(admin, id, { waiterId: ids.vali })).toMatchObject({ ok: true, data: { order: { waiterName: 'vali' } } });
    await ops.sendItems(admin, id);
    expect(await ops.cancelOrder(admin, id)).toMatchObject({ ok: false, code: 'hasActiveItems' });
    const nonItem = (await m.Order.findById(id).lean()).items[0];
    expect((await ops.voidItem(admin, id, { itemId: String(nonItem._id), reason: 'test' })).ok).toBe(true);
    expect(await ops.cancelOrder(admin, id, 'mijoz ketdi')).toMatchObject({ ok: true, data: { order: { status: 'cancelled' } } });
    expect((await m.Order.findById(id).lean()).activeTableKey).toBeUndefined();
  });

  it('parallel stol ochish — bitta buyurtma; boshqa filial xodimi ko\'rmaydi', async () => {
    const tNew = await setup.saveTable(admin, { hallId, number: 9 });
    const tid = tNew.ok ? tNew.data.id : '';
    const [a, b] = await Promise.all([
      ops.openOrder(ali, { type: 'dine_in', tableId: tid }),
      ops.openOrder(ali, { type: 'dine_in', tableId: tid }),
    ]);
    expect(a.ok && b.ok && a.data.order.id === b.data.order.id).toBe(true);
    expect(await m.Order.countDocuments({ tableId: tid })).toBe(1);
    const stranger = ctx({ ...user(new Types.ObjectId().toString(), 'begona'), branchId: String(otherBranch) }, [...WAITER, 'order.viewAll']);
    expect(await queries.getOrder(stranger, a.ok ? a.data.order.id : '')).toMatchObject({ ok: false, code: 'orderNotFound' });
    expect(await ops.openOrder(stranger, { type: 'dine_in', tableId: tid })).toMatchObject({ ok: false, code: 'tableNotFound' });
  });

  it('hisobot: tayyorlanish vaqti va yo\'qotishlar', async () => {
    const r = await queries.timingsReport(admin, { from: new Date(Date.now() - 3600_000), to: new Date(Date.now() + 60_000), branchId: String(branchId) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.overall.prep.count).toBeGreaterThanOrEqual(1);
    // Tayyorlash boshlangan osh + yetkazilgan non (o'tkazish testida)
    expect(r.data.voids.lossCount).toBe(2);
    expect(r.data.byStation.find((s) => s.name === 'Issiq sex')).toBeDefined();
  });

  it('rol shablonlari: restoran turida nomi bo\'yicha idempotent qo\'shiladi', async () => {
    const { ensureDefaultRoles } = await import('@/lib/roles');
    await m.Role.create({ name: 'Ofitsant', permissions: ['order.create', 'order.viewAll'], permVersion: 3 });
    await ensureDefaultRoles(m.Role, 'restaurant');
    await ensureDefaultRoles(m.Role, 'restaurant');
    const names = (await m.Role.find().lean()).map((r: { name: string }) => r.name).sort();
    expect(names).toEqual(['Administrator', 'Barmen', 'Kassir (restoran)', 'Ofitsant', 'Oshpaz']);
    // Egasi tahrirlagan rol ustidan yozilmaydi
    expect((await m.Role.findOne({ name: 'Ofitsant' }).lean()).permissions).toContain('order.viewAll');
  });
});
