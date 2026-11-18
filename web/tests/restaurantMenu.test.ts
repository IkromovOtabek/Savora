/**
 * Restoran «Menyu» va ombor ajratilishi (lib/restaurant/menuFlags.ts, menuAdmin.ts, recipeUnits.ts).
 * Sof mantiq — har doim; MongoDB oqimi — MONGO_TEST_URI berilsa:
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/restaurantMenu.test.ts
 * Migratsiya (idempotent, egasining tanlovini buzmaydi) → menyu faqat belgilanganlar (xodim/mijoz) → xom ashyo
 * buyurtmaga qo'shilmaydi → taom retsept bilan (g → kg), tannarx, porsiya → yuborishda xom ashyo chiqadi →
 * tugasa «Tugagan» va yuborilmaydi → ombordagi tovarni menyuga qo'shish/olish → tez xom ashyo → «ishlatiladi».
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { isOnMenu } from '@/lib/restaurant/menuFlags';
import { fromBaseQty, marginPct, portionsFrom, preferredRecipeUnit, recipeLineCost, recipeUnitsFor, toBaseQty } from '@/lib/restaurant/recipeUnits';
import { parseDishInput } from '@/lib/restaurant/menuAdmin';

vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock('@/lib/onboarding', () => ({ markOnboardingStep: vi.fn(async () => {}) }));
vi.mock('@/lib/shopNotify', () => ({ notifyNewSale: vi.fn(async () => {}), salePayLabel: () => 'naqd' }));

describe('menyu belgisi va retsept birliklari (sof mantiq)', () => {
  it('isOnMenu: belgi ustun, yo\'q bo\'lsa — turi bo\'yicha', () => {
    expect(isOnMenu({ kind: 'bundle' })).toBe(true);
    expect(isOnMenu({ kind: 'service' })).toBe(true);
    expect(isOnMenu({ kind: 'goods' })).toBe(false);
    expect(isOnMenu({})).toBe(false);
    expect(isOnMenu({ kind: 'goods', menuItem: true })).toBe(true);
    expect(isOnMenu({ kind: 'bundle', menuItem: false })).toBe(false);
  });
  it('birliklar: kg → g/kg, l → ml/l, dona — dona; asosiy birlikka aylantirish', () => {
    expect(recipeUnitsFor('kg').map((u) => u.unit)).toEqual(['g', 'kg']);
    expect(recipeUnitsFor('l').map((u) => u.unit)).toEqual(['ml', 'l']);
    expect(recipeUnitsFor('dona').map((u) => u.unit)).toEqual(['dona']);
    expect(recipeUnitsFor(null).map((u) => u.unit)).toEqual(['dona']);
    expect(toBaseQty(150, 0.001, 'kg')).toBe(0.15);
    expect(toBaseQty(30, 0.001, 'l')).toBe(0.03);
    expect(toBaseQty(0.5, 0.001, 'kg')).toBeNull(); // 0,5 g — 3 xonadan kichik
    expect(toBaseQty(1.5, 1, 'dona')).toBeNull();
    expect(toBaseQty(2, 1, 'dona')).toBe(2);
    expect(fromBaseQty(0.15, 0.001)).toBe(150);
    expect(preferredRecipeUnit('kg', 0.15).unit).toBe('g');
    expect(preferredRecipeUnit('kg', 2).unit).toBe('kg');
    expect(preferredRecipeUnit('l', null).unit).toBe('ml');
    expect(preferredRecipeUnit('dona', 1).unit).toBe('dona');
  });
  it('tannarx, foyda %, porsiya', () => {
    expect(recipeLineCost(95000, 0.1)).toBe(9500);
    expect(recipeLineCost(16000, 0.15)).toBe(2400);
    expect(marginPct(45000, 18000)).toBe(60);
    expect(marginPct(0, 100)).toBeNull();
    expect(portionsFrom([{ qty: 0.15, available: 0.45 }, { qty: 0.1, available: 10 }])).toBe(3);
    expect(portionsFrom([{ qty: 0.15, available: 0.44 }])).toBe(2);
    expect(portionsFrom([])).toBe(0);
  });
  it('parseDishInput: ishonchsiz kirish (id, narx, retsept) tekshiriladi', () => {
    const id = 'a'.repeat(24);
    expect(parseDishInput({ type: 'dish', name: 'Osh', price: 45000, recipe: [{ productId: id, qty: 0.15 }] })).toMatchObject({ type: 'dish', price: 45000 });
    expect(parseDishInput({ type: 'pizza', name: 'X', price: 1 })).toBeNull();
    expect(parseDishInput({ type: 'dish', name: 'X', price: 1.5 })).toBeNull();
    expect(parseDishInput({ type: 'dish', name: 'X', price: 1, categoryId: { $ne: null } })).toBeNull();
    expect(parseDishInput({ type: 'dish', name: 'X', price: 1, recipe: [{ productId: { $gt: '' }, qty: 1 }] })).toBeNull();
    expect(parseDishInput({ type: 'service', name: 'X', price: 1, stationId: null, categoryId: '' })).toMatchObject({ stationId: null, categoryId: null });
  });
});

const URI = process.env.MONGO_TEST_URI;

describe.skipIf(!URI)('restoran menyusi va ombor (MongoDB)', () => {
  let conn: mongoose.Connection;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any;
  let ops: typeof import('@/lib/restaurant/ops');
  let setup: typeof import('@/lib/restaurant/setup');
  let queries: typeof import('@/lib/restaurant/queries');
  let menu: typeof import('@/lib/restaurant/menuAdmin');
  let flags: typeof import('@/lib/restaurant/menuFlags');
  let pub: typeof import('@/lib/restaurant/public');
  type PK = import('@/lib/permissions').PermissionKey;

  const branchId = new Types.ObjectId();
  const ids = { admin: new Types.ObjectId().toString(), ali: new Types.ObjectId().toString() };
  const user = (id: string, username: string, role: 'admin' | 'user' = 'user') =>
    ({ id, username, role, tokenVersion: 0, dbName: 'test', organizationId: 'org', ...(role === 'user' ? { branchId: String(branchId) } : {}) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let admin: any, ali: any, cook: any;
  let kitchenId: string, tableId: string;
  const P: Record<string, string> = {};

  beforeAll(async () => {
    conn = await mongoose.createConnection(`${URI}/savora_menu_test_${Date.now()}`).asPromise();
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
    };
    m = Object.fromEntries(Object.entries(s).map(([k, schema]) => [k, conn.model(k, schema as mongoose.Schema)]));
    await Promise.all(Object.values(m).map((M) => (M as mongoose.Model<unknown>).init()));
    ops = await import('@/lib/restaurant/ops');
    setup = await import('@/lib/restaurant/setup');
    queries = await import('@/lib/restaurant/queries');
    menu = await import('@/lib/restaurant/menuAdmin');
    flags = await import('@/lib/restaurant/menuFlags');
    pub = await import('@/lib/restaurant/public');
    const d = (await import('@/lib/i18n/dict')).getDictionary('uz');
    const { resolveOrgFeatures } = await import('@/lib/features');
    const { PERMISSION_KEYS } = await import('@/lib/permissions');
    const features = resolveOrgFeatures({ plan: { tier: 'pro', maxFilial: 3, maxUsers: 10 }, businessType: 'restaurant' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (u: ReturnType<typeof user>, perms: PK[]): any => ({ user: u, orgId: 'a'.repeat(24), orgSlug: 'menu-test', m, perms: new Set(perms), features, d });
    admin = ctx(user(ids.admin, 'egasi', 'admin'), [...PERMISSION_KEYS]);
    ali = ctx(user(ids.ali, 'ali'), ['order.create']);
    cook = ctx(user(new Types.ObjectId().toString(), 'oshpaz'), ['menu.stopList', 'kitchen.view']);

    await m.Branch.create({ _id: branchId, name: 'Asosiy', isMain: true, active: true });
    await m.User.create({ _id: ids.ali, username: 'ali', password: 'x', role: 'user', branchId, active: true });
    await m.ShopSettings.create({ key: 'main', restaurant: { serviceChargePct: 0, takeawayPackFee: 0, requireVoidReason: false } });
    const hall = await setup.saveHall(admin, { name: 'Zal', branchId: String(branchId) });
    const t = await setup.saveTable(admin, { hallId: hall.ok ? hall.data.id : '', number: 1 });
    tableId = t.ok ? t.data.id : '';
    const k = await setup.saveStation(admin, { name: 'Oshxona', kind: 'kitchen', branchId: String(branchId) });
    kitchenId = k.ok ? k.data.id : '';

    // ESKI (belgisiz) restoran ma'lumoti: hammasi bitta ro'yxatda
    const mk = (over: Record<string, unknown>) => m.Product.create({
      imei: `P${Math.random().toString(36).slice(2, 10)}`, purchasePrice: 1000, salePrice: 1000, branchId, status: 'in_stock', ...over,
    });
    const rice = await mk({ name: 'Guruch', unit: 'kg', trackQuantity: true, quantity: 10, purchasePrice: 16000, salePrice: 0 });
    const meat = await mk({ name: "Go'sht", unit: 'kg', trackQuantity: true, quantity: 0.45, purchasePrice: 95000, salePrice: 0 });
    const oldDish = await mk({ name: 'Eski osh', kind: 'bundle', salePrice: 40000, bundleItems: [{ productId: rice._id, qty: 0.2 }] });
    const tea = await mk({ name: 'Choy', kind: 'service', salePrice: 8000 });
    const cola = await mk({ name: 'Cola', unit: 'dona', trackQuantity: true, quantity: 10, salePrice: 10000, stationId: new Types.ObjectId(kitchenId) });
    const bread = await mk({ name: 'Non', unit: 'dona', trackQuantity: true, quantity: 30, salePrice: 5000 });
    const water = await mk({ name: 'Suv', unit: 'dona', trackQuantity: true, quantity: 30, salePrice: 4000 });
    Object.assign(P, { rice: String(rice._id), meat: String(meat._id), oldDish: String(oldDish._id), tea: String(tea._id), cola: String(cola._id), bread: String(bread._id), water: String(water._id) });
    // Non ilgari restoran buyurtmasida sotilgan (stansiyasiz) — menyu tovari hisoblanadi
    await m.Order.create({
      orderNo: 'B1', branchId, type: 'dine_in', source: 'waiter', status: 'paid', serviceChargePct: 0, packFee: 0, rev: 0,
      items: [{ productId: bread._id, name: 'Non', basePrice: 5000, price: 5000, qty: 1, status: 'served', stockReserved: true, addedBy: 'ali', addedAt: new Date() }],
      payments: [], openedBy: 'ali', openedAt: new Date(),
    });
  });

  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  const sold = async (id: string) => (await m.Product.findById(id).lean()).soldQuantity;

  it('migratsiya: texkarta/xizmat/stansiyali/sotilgan → menyu, xom ashyo → ombor; idempotent', async () => {
    expect((await m.ShopSettings.findOne({ key: 'main' }).lean()).menuVersion).toBeUndefined();
    // Birinchi ochilish (xodim menyusi) — migratsiya
    const staff = await queries.staffMenu(ali);
    expect(staff.ok).toBe(true);
    const names = staff.ok ? staff.data.items.map((i) => i.name).sort() : [];
    expect(names).toEqual(['Choy', 'Cola', 'Eski osh', 'Non']);
    const flagOf = async (id: string) => (await m.Product.findById(id).lean()).menuItem;
    expect(await flagOf(P.rice)).toBe(false);
    expect(await flagOf(P.water)).toBe(false);
    expect(await flagOf(P.oldDish)).toBe(true);
    expect(await flagOf(P.cola)).toBe(true);
    expect(await flagOf(P.bread)).toBe(true);
    expect((await m.ShopSettings.findOne({ key: 'main' }).lean()).menuVersion).toBe(1);
    // Takroriy migratsiya egasining tanlovini o'zgartirmaydi
    await m.Product.updateOne({ _id: P.oldDish }, { $set: { menuItem: false } });
    expect(await flags.migrateMenuFlags(m)).toEqual({ menu: 0, stock: 0 });
    expect(await flagOf(P.oldDish)).toBe(false);
    await m.Product.updateOne({ _id: P.oldDish }, { $set: { menuItem: true } });
  });

  it('xom ashyo: mijoz menyusida yo\'q, buyurtmaga qo\'shilmaydi', async () => {
    const tbl = await m.Table.findById(tableId).lean();
    const c = { org: { id: 'o', name: 'T', slug: 'menu-test', dbName: 'x' }, m, table: tbl, d: admin.d };
    const pm = await pub.publicMenu(c);
    expect(pm.items.map((i) => i.name)).not.toContain('Guruch');
    expect(JSON.stringify(pm)).not.toMatch(/purchasePrice|menuItem/);
    const o = await ops.openOrder(ali, { type: 'dine_in', tableId });
    expect(o.ok).toBe(true);
    const orderId = o.ok ? o.data.order.id : '';
    expect(await ops.addItems(ali, orderId, [{ productId: P.rice, qty: 1 }])).toMatchObject({ ok: false, code: 'productNotFound' });
    expect((await ops.addItems(ali, orderId, [{ productId: P.bread, qty: 1 }])).ok).toBe(true);
    expect((await ops.cancelOrder(ali, orderId)).ok).toBe(true);
  });

  it('taom qo\'shish: retsept (asosiy birlikda), tannarx, porsiya, yuborishda xom ashyo chiqadi, tugasa — «Tugagan»', async () => {
    // Retsept xatolari
    expect(await menu.saveMenuDish(admin, { type: 'dish', name: 'Osh', price: 45000, recipe: [] })).toMatchObject({ ok: false, code: 'badInput' });
    expect(await menu.saveMenuDish(admin, { type: 'dish', name: 'Osh', price: 45000, recipe: [{ productId: P.tea, qty: 1 }] })).toMatchObject({ ok: false });
    expect(await menu.saveMenuDish(admin, { type: 'dish', name: 'Osh', price: 45000, recipe: [{ productId: P.rice, qty: 0.0005 }] })).toMatchObject({ ok: false });
    expect(await menu.saveMenuDish(admin, { type: 'dish', name: 'Osh', price: 45000, recipe: [{ productId: P.rice, qty: 1 }, { productId: P.rice, qty: 2 }] })).toMatchObject({ ok: false });
    expect(await menu.saveMenuDish(ali, { type: 'dish', name: 'Osh', price: 45000, recipe: [{ productId: P.rice, qty: 0.15 }] })).toMatchObject({ ok: false, code: 'noPermission' });

    const r = await menu.saveMenuDish(admin, {
      type: 'dish', branchId: String(branchId), name: '  Osh  ', price: 45000, stationId: kitchenId,
      recipe: [{ productId: P.rice, qty: 0.15 }, { productId: P.meat, qty: 0.15 }],
    });
    expect(r).toMatchObject({ ok: true, data: { created: true } });
    P.osh = r.ok ? r.data.id : '';
    const doc = await m.Product.findById(P.osh).lean();
    // 0,15 × 16 000 + 0,15 × 95 000 = 2 400 + 14 250
    expect(doc).toMatchObject({ name: 'Osh', kind: 'bundle', menuItem: true, trackQuantity: false, purchasePrice: 16650, salePrice: 45000 });
    expect(doc.bundleItems.map((i: { qty: number }) => i.qty)).toEqual([0.15, 0.15]);

    const view = await menu.menuAdminView(admin, { branchId: String(branchId) });
    expect(view.ok).toBe(true);
    const row = view.ok ? view.data.items.find((i) => i.id === P.osh)! : null;
    // Go'sht 0,45 kg / 0,15 = 3 porsiya
    expect(row).toMatchObject({ type: 'dish', portions: 3, cost: 16650, recipeCount: 2, stationId: kitchenId });
    expect(row!.margin).toBeCloseTo(63, 0);
    // Tannarx — faqat product.viewCost bilan
    const noCost = await menu.menuAdminView(cook, { branchId: String(branchId) });
    expect(noCost.ok && noCost.data.items.every((i) => i.cost === null)).toBe(true);
    expect(view.ok && view.data.items.map((i) => i.name)).not.toContain('Guruch');

    // Ofitsant: 3 porsiya yuboriladi, xom ashyo ombordan chiqadi
    const o = await ops.openOrder(ali, { type: 'dine_in', tableId });
    const orderId = o.ok ? o.data.order.id : '';
    expect((await ops.addItems(ali, orderId, [{ productId: P.osh, qty: 3 }])).ok).toBe(true);
    expect((await ops.sendItems(ali, orderId)).ok).toBe(true);
    expect(await sold(P.rice)).toBeCloseTo(0.45);
    expect(await sold(P.meat)).toBeCloseTo(0.45);
    // Go'sht tugadi — taom «Tugagan» (xodim menyusida available 0) va yuborilmaydi
    const staff = await queries.staffMenu(ali);
    expect(staff.ok && staff.data.items.find((i) => i.id === P.osh)!.available).toBe(0);
    const after = await menu.menuAdminView(admin, { branchId: String(branchId) });
    expect(after.ok && after.data.items.find((i) => i.id === P.osh)!.portions).toBe(0);
    expect((await ops.addItems(ali, orderId, [{ productId: P.osh, qty: 1 }])).ok).toBe(true);
    const fail = await ops.sendItems(ali, orderId);
    expect(fail).toMatchObject({ ok: false, code: 'sendFailed' });
    expect(!fail.ok && (fail.details?.failed as { reason: string }[])[0].reason).toBe('outOfStock');
    expect(await sold(P.rice)).toBeCloseTo(0.45);

    // Retsept tahriri: go'sht 150 g → 100 g; xizmatga o'tkazish — retsept olib tashlanadi
    expect((await menu.saveMenuDish(admin, { id: P.osh, type: 'dish', name: 'Osh', price: 45000, recipe: [{ productId: P.rice, qty: 0.15 }, { productId: P.meat, qty: 0.1 }] })).ok).toBe(true);
    expect((await m.Product.findById(P.osh).lean()).purchasePrice).toBe(2400 + 9500);
    expect(await menu.saveMenuDish(admin, { id: P.osh, type: 'goods', name: 'Osh', price: 1 })).toMatchObject({ ok: false });
  });

  it('ombordagi tovarni menyuga qo\'shish/olish; tez xom ashyo; «qaysi taomlarda ishlatiladi»', async () => {
    expect(await menu.saveMenuDish(admin, { type: 'goods', productId: P.cola, name: 'Cola', price: 10000 })).toMatchObject({ ok: false }); // allaqachon menyuda
    const add = await menu.saveMenuDish(admin, { type: 'goods', productId: P.water, name: 'Suv 0,5', price: 6000, stationId: null });
    expect(add).toMatchObject({ ok: true, data: { id: P.water, created: false } });
    expect((await m.Product.findById(P.water).lean())).toMatchObject({ menuItem: true, kind: 'goods', salePrice: 6000, name: 'Suv 0,5' });
    let staff = await queries.staffMenu(ali);
    expect(staff.ok && staff.data.items.map((i) => i.name)).toContain('Suv 0,5');
    // Menyudan olish — omborda qoladi (restoran ombori filtri bo'yicha ko'rinadi)
    expect(await menu.setMenuMembership(ali, P.water, false)).toMatchObject({ ok: false, code: 'noPermission' });
    expect(await menu.setMenuMembership(admin, P.water, false)).toMatchObject({ ok: true, data: { inMenu: false } });
    staff = await queries.staffMenu(ali);
    expect(staff.ok && staff.data.items.map((i) => i.name)).not.toContain('Suv 0,5');
    const stockList = await m.Product.find({ branchId, ...flags.stockOnlyFilter() }).select('name').lean();
    expect(stockList.map((p: { name: string }) => p.name).sort()).toEqual(['Cola', "Go'sht", 'Guruch', 'Non', 'Suv 0,5']);
    // Taomni menyudan olish — «Menyudan olinganlar»da
    expect((await menu.setMenuMembership(admin, P.tea, false)).ok).toBe(true);
    const view = await menu.menuAdminView(admin, { branchId: String(branchId) });
    expect(view.ok && view.data.hidden.map((i) => i.name)).toEqual(['Choy']);

    // Tez xom ashyo (omborga, menyuga emas)
    expect(await menu.quickCreateIngredient(admin, { branchId: String(branchId), name: 'Zira', unit: 'kg', cost: 80000, qty: 0 })).toMatchObject({ ok: false });
    const z = await menu.quickCreateIngredient(admin, { branchId: String(branchId), name: 'Zira', unit: 'kg', cost: 80000, qty: 0.5 });
    expect(z).toMatchObject({ ok: true, data: { name: 'Zira', unit: 'kg', available: 0.5, cost: 80000, tracked: true } });
    const zDoc = await m.Product.findById(z.ok ? z.data.id : '').lean();
    expect(zDoc).toMatchObject({ kind: 'goods', menuItem: false, trackQuantity: true, quantity: 0.5, salePrice: 0 });

    const usage = await menu.ingredientUsage(m, [P.rice, P.meat, P.bread]);
    expect(usage.get(P.rice)!.map((x) => x.name).sort()).toEqual(['Eski osh', 'Osh']);
    expect(usage.get(P.meat)!.map((x) => x.name)).toEqual(['Osh']);
    expect(usage.has(P.bread)).toBe(false);

    // Taom formasi: ombor ro'yxatida menyudagi tovar yo'q (retseptdagisi bor)
    const form = await menu.dishFormData(admin, { id: P.osh });
    expect(form.ok && form.data.stock.map((s) => s.name)).toEqual(expect.arrayContaining(['Guruch', "Go'sht", 'Zira', 'Suv 0,5']));
    expect(form.ok && form.data.stock.map((s) => s.name)).not.toContain('Cola');
    expect(form.ok && form.data.dish).toMatchObject({ type: 'dish', recipe: [{ productId: P.rice, qty: 0.15 }, { productId: P.meat, qty: 0.1 }] });
  });
});
