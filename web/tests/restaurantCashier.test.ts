/**
 * Hisoblar ko'rinishi, kassir navbati va saboyning stoli (RESTORAN_API.md §16).
 *   npx vitest run tests/restaurantCashier.test.ts                      — sof funksiyalar (bills.ts, varaq, sxema)
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/restaurantCashier.test.ts — bazali oqim ham
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { billMatches, billRank, buildBills, linkedTakeaways, linkedTotals, shortOrderNo } from '@/lib/restaurant/bills';
import { ticketPlace } from '@/components/restaurant/print/printLogic';
import { restaurantSchemas } from '@/lib/restaurant/inputs';
import { getDictionary } from '@/lib/i18n/dict';
import type { OrderSummary } from '@/lib/restaurant/view';
import type { TableBoardRow } from '@/lib/restaurant/queries';

vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock('@/lib/onboarding', () => ({ markOnboardingStep: vi.fn(async () => {}) }));
vi.mock('@/lib/shopNotify', () => ({ notifyNewSale: vi.fn(async () => {}), salePayLabel: () => 'naqd' }));

/* ───────────────────────────── sof funksiyalar ───────────────────────────── */

const sum = (id: string, p: Partial<OrderSummary> = {}): OrderSummary => ({
  id, orderNo: `B20261120-${id.padStart(4, '0')}`, type: 'dine_in', status: 'open', source: 'waiter',
  tableId: null, tableNumber: null, forTableId: null, forTableNumber: null, guests: null,
  waiterId: 'u1', waiterName: 'Ali', openedAt: '2026-11-20T10:00:00.000Z', precheckAt: null, updatedAt: null,
  access: true, mine: true, total: 10000, due: 10000, counts: null, ...p,
});
const table = (id: string, number: number, order: OrderSummary | null, billAt: string | null = null): TableBoardRow => ({
  id, hallId: 'h1', number, seats: 4, x: null, y: null, calls: { waiterAt: null, billAt }, order, reservation: null,
});

describe('hisoblar ro\'yxati (bills.ts)', () => {
  const t1 = table('t1', 1, sum('1', { tableId: 't1', tableNumber: 1, openedAt: '2026-11-20T10:00:00.000Z', due: 50000 }));
  const t2 = table('t2', 2, sum('2', { tableId: 't2', tableNumber: 2, openedAt: '2026-11-20T09:00:00.000Z', due: 30000, status: 'precheck', precheckAt: '2026-11-20T11:00:00.000Z' }));
  const t3 = table('t3', 3, sum('3', { tableId: 't3', tableNumber: 3, openedAt: '2026-11-20T08:00:00.000Z', due: 20000 }), '2026-11-20T11:30:00.000Z');
  // Boshqa ofitsant stoli — summalar yashirin, ro'yxatga kirmaydi
  const t4 = table('t4', 4, sum('4', { tableId: 't4', tableNumber: 4, access: false, mine: false, total: null, due: null }));
  const t5 = table('t5', 5, null);
  const t6 = table('t6', 6, sum('6', { tableId: 't6', tableNumber: 6, openedAt: '2026-11-20T07:00:00.000Z', due: 15000 }));
  const tk = {
    // 1-stol mehmonlariga ikkita saboy (stol qatori ostida, eskisi birinchi)
    a: sum('11', { type: 'takeaway', forTableId: 't1', forTableNumber: 1, openedAt: '2026-11-20T10:30:00.000Z', due: 25000 }),
    b: sum('12', { type: 'takeaway', forTableId: 't1', forTableNumber: 1, openedAt: '2026-11-20T10:10:00.000Z', due: 5000, status: 'precheck' }),
    // Bo'sh 5-stol mehmonlariga — alohida qator, stol raqami bilan
    c: sum('13', { type: 'takeaway', forTableId: 't5', forTableNumber: 5, openedAt: '2026-11-20T06:00:00.000Z', due: 7000 }),
    // Boshqa ofitsant stoliga (4) bog'langan, lekin o'zim ko'raman — alohida qator
    e: sum('14', { type: 'takeaway', forTableId: 't4', forTableNumber: 4, openedAt: '2026-11-20T12:00:00.000Z', due: 1000 }),
    // Stolsiz
    f: sum('15', { type: 'takeaway', openedAt: '2026-11-20T05:00:00.000Z', due: 9000 }),
  };
  const board = { tables: [t1, t2, t3, t4, t5, t6], takeaway: [tk.a, tk.b, tk.c, tk.e, tk.f] };

  it('bog\'langan saboylar stol bo\'yicha; jamlama', () => {
    const map = linkedTakeaways(board);
    expect(map.get('t1')?.map((o) => o.id)).toEqual(['12', '11']);
    expect(map.get('t5')?.map((o) => o.id)).toEqual(['13']);
    expect(map.has('t2')).toBe(false);
    expect(linkedTotals(map.get('t1'))).toEqual({ count: 2, due: 30000 });
    expect(linkedTotals(map.get('t2'))).toBeNull();
    // Kirish yo'q saboy hisobga kirmaydi
    expect(linkedTakeaways({ takeaway: [{ ...tk.a, access: false }] }).size).toBe(0);
  });

  it('guruhlash: saboy stol ostida, stoli ko\'rinmasa — alohida; boshqa ofitsant stoli yo\'q', () => {
    const { rows } = buildBills(board);
    const ids = rows.map((r) => r.order.id);
    expect(ids).not.toContain('4');
    const r1 = rows.find((r) => r.order.id === '1')!;
    expect(r1.linked.map((o) => o.id)).toEqual(['12', '11']);
    expect(ids).not.toContain('11');
    const rc = rows.find((r) => r.order.id === '13')!;
    expect(rc).toMatchObject({ tableId: 't5', tableNumber: 5, hallId: 'h1', billAt: null, linked: [] });
    expect(rows.find((r) => r.order.id === '14')?.tableNumber).toBe(4);
    expect(rows.find((r) => r.order.id === '15')).toMatchObject({ tableId: null, tableNumber: null, hallId: null });
  });

  it('tartib: pre-chek / hisob so\'ragan birinchi, keyin eng eskisi', () => {
    const { rows } = buildBills(board);
    // 0-guruh: 3-stol (hisob so'radi, 08:00), 2-stol (pre-chek, 09:00), 1-stol (bog'langan saboy pre-chekda, 10:00)
    expect(rows.slice(0, 3).map((r) => r.order.id)).toEqual(['3', '2', '1']);
    expect(rows.slice(0, 3).every((r) => billRank(r) === 0)).toBe(true);
    // 1-guruh: eskisidan — stolsiz saboy 05:00, 5-stol saboyi 06:00, 6-stol 07:00, 4-stol saboyi 12:00
    expect(rows.slice(3).map((r) => r.order.id)).toEqual(['15', '13', '6', '14']);
  });

  it('jamlama: hisoblar soni, summa, pre-chek, hisob so\'rovlari', () => {
    const { summary } = buildBills(board);
    // 1, 2, 3, 6 stollar + 5 ta saboy (4-stol — kirish yo'q)
    expect(summary).toEqual({ count: 9, due: 50000 + 30000 + 20000 + 15000 + 25000 + 5000 + 7000 + 1000 + 9000, precheck: 2, billRequests: 1 });
    expect(buildBills({ tables: [t5], takeaway: [] })).toEqual({ rows: [], summary: { count: 0, due: 0, precheck: 0, billRequests: 0 } });
  });

  it('qidiruv: stol raqami boshlanishi, saboy raqami, ofitsant', () => {
    const { rows } = buildBills(board);
    const find = (q: string) => rows.filter((r) => billMatches(r, q)).map((r) => r.order.id);
    expect(find('')).toHaveLength(rows.length);
    expect(find('1')).toEqual(expect.arrayContaining(['1', '15', '13', '14']));
    // 5 — faqat 5-stol mehmonlari saboyi (№0015 raqami «15» — 5 bilan boshlanmaydi)
    expect(find('5')).toEqual(['13']);
    expect(find('15')).toEqual(['15']);
    expect(find('2')).toEqual(['2']);
    expect(find('ali')).toHaveLength(rows.length);
    expect(find('vali')).toEqual([]);
    expect(shortOrderNo('B20261120-0042')).toBe('0042');
  });
});

describe('oshxona varag\'i: saboyning stoli', () => {
  const uz = getDictionary('uz');
  const ru = getDictionary('ru');
  it('«SABOY · STOL 5»', () => {
    expect(ticketPlace({ orderType: 'takeaway', tableNumber: null, forTableNumber: 5 }, uz)).toBe('SABOY · STOL 5');
    expect(ticketPlace({ orderType: 'takeaway', tableNumber: null, forTableNumber: null }, uz)).toBe('SABOY');
    expect(ticketPlace({ orderType: 'takeaway', tableNumber: null }, uz)).toBe('SABOY');
    expect(ticketPlace({ orderType: 'dine_in', tableNumber: 5, forTableNumber: 9 }, uz)).toBe('STOL 5');
    expect(ticketPlace({ orderType: 'takeaway', tableNumber: null, forTableNumber: 3 }, ru)).toBe(`${ru.restaurant.print.ticketTakeaway} · СТОЛ 3`);
  });
});

describe('kirish sxemasi: forTableId', () => {
  const s = restaurantSchemas(getDictionary('uz').restaurant.errors);
  const hex = new Types.ObjectId().toString();
  it('info: yo\'q — o\'zgarmaydi, null/\'\' — olib tashlash, id — 24 hex, boshqasi rad', () => {
    expect(s.info.safeParse({}).data?.forTableId).toBeUndefined();
    expect(s.info.safeParse({ forTableId: null }).data?.forTableId).toBeNull();
    expect(s.info.safeParse({ forTableId: '' }).data?.forTableId).toBeNull();
    expect(s.info.safeParse({ forTableId: hex }).data?.forTableId).toBe(hex);
    expect(s.info.safeParse({ forTableId: 'abc' }).success).toBe(false);
    expect(s.info.safeParse({ forTableId: { $ne: null } }).success).toBe(false);
    expect(s.info.safeParse({ forTableId: 5 }).success).toBe(false);
  });
  it('openOrder: ixtiyoriy id', () => {
    expect(s.openOrder.safeParse({ type: 'takeaway', forTableId: hex }).data?.forTableId).toBe(hex);
    expect(s.openOrder.safeParse({ type: 'takeaway' }).data?.forTableId).toBeUndefined();
    expect(s.openOrder.safeParse({ type: 'takeaway', forTableId: { $gt: '' } }).success).toBe(false);
  });
});

/* ───────────────────────────── bazali oqim ───────────────────────────── */

const URI = process.env.MONGO_TEST_URI;

describe.skipIf(!URI)('saboyning stoli va kassir (MongoDB)', () => {
  let conn: mongoose.Connection;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any;
  let ops: typeof import('@/lib/restaurant/ops');
  let setup: typeof import('@/lib/restaurant/setup');
  let queries: typeof import('@/lib/restaurant/queries');
  let pq: typeof import('@/lib/restaurant/printQueue');
  type PK = import('@/lib/permissions').PermissionKey;

  const branchId = new Types.ObjectId();
  const otherBranch = new Types.ObjectId();
  const ids = { admin: new Types.ObjectId().toString(), ali: new Types.ObjectId().toString(), vali: new Types.ObjectId().toString(), kassir: new Types.ObjectId().toString(), alien: new Types.ObjectId().toString() };
  const user = (id: string, username: string, role: 'admin' | 'user' = 'user', branch = branchId) =>
    ({ id, username, role, tokenVersion: 0, dbName: 'test', organizationId: 'org', ...(role === 'user' ? { branchId: String(branch) } : {}) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let admin: any, ali: any, vali: any, kassir: any, alien: any;
  const T: Record<number | string, string> = {};
  const P: Record<string, string> = {};

  beforeAll(async () => {
    conn = await mongoose.createConnection(`${URI}/savora_cashier_test_${Date.now()}`).asPromise();
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
    queries = await import('@/lib/restaurant/queries');
    pq = await import('@/lib/restaurant/printQueue');
    const d = getDictionary('uz');
    const { resolveOrgFeatures } = await import('@/lib/features');
    const { PERMISSION_KEYS } = await import('@/lib/permissions');
    const features = resolveOrgFeatures({ plan: { tier: 'pro', maxFilial: 3, maxUsers: 10 }, businessType: 'restaurant' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (u: ReturnType<typeof user>, perms: PK[]): any => ({ user: u, orgId: 'a'.repeat(24), orgSlug: 'osh', m, perms: new Set(perms), features, d });
    admin = ctx(user(ids.admin, 'egasi', 'admin'), [...PERMISSION_KEYS]);
    ali = ctx(user(ids.ali, 'ali'), ['order.create']);
    vali = ctx(user(ids.vali, 'vali'), ['order.create']);
    kassir = ctx(user(ids.kassir, 'kassir'), ['sale.create', 'order.create', 'order.viewAll', 'order.split', 'kitchen.view']);
    alien = ctx(user(ids.alien, 'begona', 'user', otherBranch), ['order.create', 'order.viewAll']);

    await m.Branch.create([{ _id: branchId, name: 'Chilonzor', active: true }, { _id: otherBranch, name: 'Yunusobod', active: true }]);
    await m.User.create([
      { _id: ids.ali, username: 'ali', fullName: 'Ali Valiyev', password: 'x', role: 'user', branchId, active: true },
      { _id: ids.vali, username: 'vali', password: 'x', role: 'user', branchId, active: true },
    ]);
    await m.ShopSettings.create({ key: 'main', restaurant: { serviceChargePct: 10, takeawayPackFee: 2000, requireVoidReason: true } });
    const hall = await setup.saveHall(admin, { name: 'Zal', branchId: String(branchId) });
    const hallId = hall.ok ? hall.data.id : '';
    expect((await setup.createTablesRange(admin, { hallId, from: 1, to: 3, seats: 4 })).ok).toBe(true);
    for (const t of await m.Table.find({ branchId }).lean()) T[t.number] = String(t._id);
    const off = await setup.saveTable(admin, { hallId, number: 9 });
    expect(off.ok).toBe(true);
    T.off = off.ok ? off.data.id : '';
    expect((await setup.saveTable(admin, { id: T.off, hallId, number: 9, active: false })).ok).toBe(true);
    expect((await m.Table.findById(T.off).lean()).active).toBe(false);
    const otherHall = await setup.saveHall(admin, { name: 'Boshqa zal', branchId: String(otherBranch) });
    const oh = otherHall.ok ? otherHall.data.id : '';
    expect((await setup.createTablesRange(admin, { hallId: oh, from: 1, to: 1 })).ok).toBe(true);
    T.other = String((await m.Table.findOne({ branchId: otherBranch, number: 1 }).lean())._id);

    const k = await setup.saveStation(admin, { name: 'Issiq sex', kind: 'kitchen', branchId: String(branchId), printEnabled: true });
    const kitchenId = k.ok ? k.data.id : '';
    const mk = (over: Record<string, unknown>) => m.Product.create({
      imei: `P${Math.random().toString(36).slice(2, 10)}`, purchasePrice: 1000, salePrice: 1000, branchId, status: 'in_stock', trackQuantity: true, quantity: 50, menuItem: true, ...over,
    });
    const osh = await mk({ name: 'Osh', salePrice: 45000 });
    const non = await mk({ name: 'Non', kind: 'service', trackQuantity: false, salePrice: 3000 });
    Object.assign(P, { osh: String(osh._id), non: String(non._id) });
    expect((await setup.updateMenuItem(admin, P.osh, { stationId: kitchenId })).ok).toBe(true);
  });

  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  let tk1 = '';
  let dine1 = '';

  it('saboy 1-stol mehmonlariga: forTableId/forTableNumber, stol band qilinmaydi', async () => {
    const r = await ops.openOrder(ali, { type: 'takeaway', forTableId: T[1], items: [{ productId: P.non, qty: 2 }] });
    expect(r.ok ? true : `${r.code}: ${r.error}`).toBe(true);
    if (!r.ok) return;
    tk1 = r.data.order.id;
    expect(r.data.order).toMatchObject({ type: 'takeaway', tableId: null, tableNumber: null, forTableId: T[1], forTableNumber: 1, serviceChargePct: 0 });
    const doc = await m.Order.findById(tk1).lean();
    expect(doc.activeTableKey).toBeUndefined();
    expect(String(doc.forTableId)).toBe(T[1]);
  });

  it('stoldagi buyurtma noyobligiga ta\'sir qilmaydi: 1-stol ochiladi, ikkinchi saboy ham', async () => {
    const dine = await ops.openOrder(ali, { type: 'dine_in', tableId: T[1], guests: 3 });
    expect(dine).toMatchObject({ ok: true, data: { existing: false, order: { tableNumber: 1, forTableId: null } } });
    dine1 = dine.ok ? dine.data.order.id : '';
    // Qayta ochish — o'sha buyurtma (bir stolda bitta ochiq buyurtma qoidasi o'zgarmagan)
    expect(await ops.openOrder(ali, { type: 'dine_in', tableId: T[1] })).toMatchObject({ ok: true, data: { existing: true, order: { id: dine1 } } });
    const second = await ops.openOrder(vali, { type: 'takeaway', forTableId: T[1] });
    expect(second).toMatchObject({ ok: true, data: { existing: false, order: { forTableNumber: 1 } } });
  });

  it('rad: stoldagi buyurtmaga forTableId, nofaol stol, boshqa filial stoli, noto\'g\'ri id', async () => {
    expect(await ops.openOrder(ali, { type: 'dine_in', tableId: T[2], forTableId: T[3] })).toMatchObject({ ok: false, code: 'badInput' });
    expect(await m.Order.exists({ activeTableKey: T[2] })).toBeNull();
    expect(await ops.openOrder(ali, { type: 'takeaway', forTableId: T.off })).toMatchObject({ ok: false, code: 'tableNotFound', status: 404 });
    expect(await ops.openOrder(ali, { type: 'takeaway', forTableId: T.other })).toMatchObject({ ok: false, code: 'tableNotFound' });
    // Admin: saboy shu filialda, stol boshqa filialda — rad
    expect(await ops.openOrder(admin, { type: 'takeaway', branchId: String(branchId), forTableId: T.other })).toMatchObject({ ok: false, code: 'tableNotFound' });
    // Boshqa filial xodimi bu filial stolini bog'lay olmaydi
    expect(await ops.openOrder(alien, { type: 'takeaway', forTableId: T[1] })).toMatchObject({ ok: false, code: 'tableNotFound' });
    expect(await ops.openOrder(ali, { type: 'takeaway', forTableId: 'nope' })).toMatchObject({ ok: false, code: 'tableNotFound' });
  });

  it('keyin o\'zgartirish va olib tashlash (updateOrderInfo)', async () => {
    const to2 = await ops.updateOrderInfo(ali, tk1, { forTableId: T[2] });
    expect(to2).toMatchObject({ ok: true, data: { order: { forTableId: T[2], forTableNumber: 2 } } });
    // Mehmonlar/izoh bilan birga, stol o'zgarmaydi (undefined)
    expect(await ops.updateOrderInfo(ali, tk1, { note: 'tezroq' })).toMatchObject({ ok: true, data: { order: { note: 'tezroq', forTableNumber: 2 } } });
    expect(await ops.updateOrderInfo(ali, tk1, { forTableId: T.other })).toMatchObject({ ok: false, code: 'tableNotFound' });
    expect(await ops.updateOrderInfo(ali, tk1, { forTableId: T.off })).toMatchObject({ ok: false, code: 'tableNotFound' });
    expect(await ops.updateOrderInfo(ali, dine1, { forTableId: T[2] })).toMatchObject({ ok: false, code: 'badInput' });
    // Boshqa ofitsant (viewAll yo'q) — buyurtma ko'rinmaydi
    expect(await ops.updateOrderInfo(vali, tk1, { forTableId: T[3] })).toMatchObject({ ok: false, code: 'orderNotFound' });
    const cleared = await ops.updateOrderInfo(ali, tk1, { forTableId: null });
    expect(cleared).toMatchObject({ ok: true, data: { order: { forTableId: null, forTableNumber: null } } });
    const doc = await m.Order.findById(tk1).lean();
    expect(doc.forTableId).toBeUndefined();
    expect(doc.forTableNumber).toBeUndefined();
    expect((await ops.updateOrderInfo(ali, tk1, { forTableId: T[1] })).ok).toBe(true);
  });

  it('taxta va hisoblar: bog\'langan saboylar, kirish qoidasi', async () => {
    // Ali (viewAll yo'q): o'z stoli va o'z saboyi; Valining saboyi ko'rinmaydi
    const a = await queries.tablesBoard(ali, {});
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.data.takeaway.map((o) => o.id)).toEqual([tk1]);
    expect(a.data.takeaway[0]).toMatchObject({ forTableId: T[1], forTableNumber: 1, precheckAt: null });
    const billsA = buildBills(a.data);
    expect(billsA.rows).toHaveLength(1);
    expect(billsA.rows[0]).toMatchObject({ tableNumber: 1, order: { id: dine1 } });
    expect(billsA.rows[0].linked.map((o) => o.id)).toEqual([tk1]);
    expect(billsA.summary.count).toBe(2);

    // Vali: Ali stoli «band» (access: false) — uning saboyi alohida qator (stol raqami bilan)
    const v = await queries.tablesBoard(vali, {});
    if (!v.ok) throw new Error(v.error);
    const billsV = buildBills(v.data);
    expect(billsV.rows).toHaveLength(1);
    expect(billsV.rows[0]).toMatchObject({ tableNumber: 1, linked: [], order: { type: 'takeaway', forTableNumber: 1 } });

    // Kassir (viewAll): hammasi — 1-stol ostida ikkala saboy
    const k = await queries.tablesBoard(kassir, {});
    if (!k.ok) throw new Error(k.error);
    const billsK = buildBills(k.data);
    expect(billsK.rows).toHaveLength(1);
    expect(billsK.rows[0].linked).toHaveLength(2);
    expect(billsK.summary.count).toBe(3);
    expect(linkedTotals(linkedTakeaways(k.data).get(T[1]))?.count).toBe(2);

    // Ro'yxat API ham shu maydonlar bilan
    const list = await queries.listOrders(kassir, { type: 'takeaway' });
    if (!list.ok) throw new Error(list.error);
    expect(list.data.orders.every((o) => o.forTableNumber === 1)).toBe(true);
  });

  it('kassir navbati: pre-chek va hisob so\'ragan birinchi', async () => {
    const t2 = await ops.openOrder(vali, { type: 'dine_in', tableId: T[2], items: [{ productId: P.non, qty: 1 }] });
    const t3 = await ops.openOrder(vali, { type: 'dine_in', tableId: T[3], items: [{ productId: P.non, qty: 1 }] });
    if (!t2.ok || !t3.ok) throw new Error('open');
    expect((await ops.precheckOrder(vali, t3.data.order.id)).ok).toBe(true);
    const k1 = await queries.tablesBoard(kassir, {});
    if (!k1.ok) throw new Error(k1.error);
    const order1 = buildBills(k1.data).rows.map((r) => r.tableNumber);
    // 3-stol pre-chekda — birinchi; 1-stol (eskiroq) keyin 2-stol
    expect(order1).toEqual([3, 1, 2]);
    expect(buildBills(k1.data).summary.precheck).toBe(1);
    // 2-stol mijozi QR'dan hisob so'radi
    await m.Table.updateOne({ _id: T[2] }, { $set: { callBillAt: new Date() } });
    const k2 = await queries.tablesBoard(kassir, {});
    if (!k2.ok) throw new Error(k2.error);
    const b2 = buildBills(k2.data);
    expect(b2.rows.map((r) => r.tableNumber)).toEqual([2, 3, 1]);
    expect(b2.summary.billRequests).toBe(1);
    expect((await ops.ackTableCall(kassir, T[2], 'bill')).ok).toBe(true);
  });

  it('oshxona varag\'i va KDS: «Saboy · 1-stol»', async () => {
    expect((await ops.addItems(ali, tk1, [{ productId: P.osh, qty: 1 }])).ok).toBe(true);
    expect((await ops.sendItems(ali, tk1)).ok).toBe(true);
    const job = await m.PrintJob.findOne({ orderId: tk1 }).lean();
    expect(job).toMatchObject({ orderType: 'takeaway', forTableNumber: 1 });
    expect(job.tableNumber).toBeUndefined();
    const view = pq.printJobView(job, Date.now());
    expect(view.forTableNumber).toBe(1);
    expect(ticketPlace(view, getDictionary('uz'))).toBe('SABOY · STOL 1');
    const kds = await queries.kitchenBoard(kassir, {});
    if (!kds.ok) throw new Error(kds.error);
    expect(kds.data.orders.find((o) => o.id === tk1)).toMatchObject({ type: 'takeaway', tableNumber: null, forTableNumber: 1 });
  });

  it('to\'lov: chek qatorida forTableNumber, stol bo\'sh qoladi; navbatdan chiqadi', async () => {
    const paid = await ops.payOrder(kassir, tk1, { parts: [{ method: 'cash', amount: 1_000_000 }] });
    expect(paid.ok ? true : `${paid.code}: ${paid.error}`).toBe(true);
    if (!paid.ok) return;
    expect(paid.data.closed).toBe(true);
    const sales = await m.Sale.find({ orderId: new Types.ObjectId(tk1) }).lean();
    expect(sales.length).toBeGreaterThan(0);
    expect(sales.every((x: { forTableNumber?: number; tableNumber?: number }) => x.forTableNumber === 1 && x.tableNumber === undefined)).toBe(true);
    // 1-stoldagi buyurtma o'zgarmagan, saboy navbatdan chiqdi
    const k = await queries.tablesBoard(kassir, {});
    if (!k.ok) throw new Error(k.error);
    const row1 = buildBills(k.data).rows.find((r) => r.tableNumber === 1 && r.order.type === 'dine_in');
    expect(row1?.linked.map((o) => o.id)).not.toContain(tk1);
    expect(k.data.tables.find((t) => t.id === T[1])?.order?.id).toBe(dine1);
  });

  it('yopilgan saboyda stolni o\'zgartirib bo\'lmaydi', async () => {
    expect(await ops.updateOrderInfo(ali, tk1, { forTableId: T[2] })).toMatchObject({ ok: false, code: 'orderClosed' });
  });
});
