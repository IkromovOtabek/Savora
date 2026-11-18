/**
 * Restoran hisobotlari (lib/restaurant/reports.ts):
 *  - sof hisoblash: davr, oshxona vaqtlari jamlanmasi (o'rtacha / p90), bekor qilinganlar, savdo KPI, CSV;
 *  - aggregation (MONGO_TEST_URI berilsa): MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/restaurantReports.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose, { Types } from 'mongoose';
import {
  REPORT_MAX_DAYS,
  fmtDuration,
  parseReportRange,
  reportCsv,
  summarizeKitchen,
  summarizeSales,
  summarizeVoids,
  type KitchenGroup,
  type RestaurantReport,
  type SalesOrder,
} from '@/lib/restaurant/reports';
import { getDictionary } from '@/lib/i18n/dict';

const MIN = 60_000;
const d = getDictionary('uz');

describe('parseReportRange', () => {
  const now = new Date(2026, 10, 18, 15, 30);
  it('sukut — bugun, presetlar', () => {
    const r = parseReportRange({}, now);
    expect(r.period).toBe('today');
    expect(r.from).toEqual(new Date(2026, 10, 18));
    expect(r.to).toEqual(new Date(2026, 10, 19));
    expect(r.fromDay).toBe('2026-11-18');
    expect(r.toDay).toBe('2026-11-18');
    expect(parseReportRange({ p: 'week' }, now)).toMatchObject({ period: 'week', fromDay: '2026-11-12', toDay: '2026-11-18' });
    expect(parseReportRange({ p: 'yesterday' }, now)).toMatchObject({ fromDay: '2026-11-17', toDay: '2026-11-17' });
    // noma'lum / hisobotda yo'q davr (yil) — bugun
    expect(parseReportRange({ p: 'year' }, now).period).toBe('today');
  });
  it('oraliq: ikkala kun kiradi, teskari bo\'lsa almashtiriladi', () => {
    const r = parseReportRange({ from: '2026-11-10', to: '2026-11-03' }, now);
    expect(r).toMatchObject({ period: 'range', fromDay: '2026-11-03', toDay: '2026-11-10', clamped: false });
    expect(r.from).toEqual(new Date(2026, 10, 3));
    expect(r.to).toEqual(new Date(2026, 10, 11));
  });
  it(`oraliq ${REPORT_MAX_DAYS} kundan uzun — qisqartiriladi`, () => {
    const r = parseReportRange({ from: '2026-01-01', to: '2026-11-18' }, now);
    expect(r.clamped).toBe(true);
    expect(r.toDay).toBe('2026-11-18');
    expect(Math.round((r.to.getTime() - r.from.getTime()) / 86_400_000)).toBe(REPORT_MAX_DAYS);
  });
  it('noto\'g\'ri sana — preset', () => {
    expect(parseReportRange({ from: '2026-02-31', to: '2026-03-01', p: 'month' }, now).period).toBe('month');
  });
});

describe('summarizeKitchen', () => {
  const g = (over: Partial<KitchenGroup>): KitchenGroup => ({
    stationId: 's1', productId: 'p1', name: 'Osh', waiterKey: 'u1', waiterName: 'Ali', prep: [], delivery: [], ...over,
  });
  const stations = new Map([['s1', { name: 'Issiq sex', kind: 'kitchen' as const }], ['s2', { name: 'Bar', kind: 'bar' as const }]]);

  it('stansiya, taom, ofitsant bo\'yicha jamlaydi; o\'rtacha va 90-persentil', () => {
    const prep = Array.from({ length: 10 }, (_, i) => (i + 1) * MIN); // 1..10 daq
    const r = summarizeKitchen([
      g({ prep: prep.slice(0, 5), delivery: [2 * MIN, null] }),
      g({ waiterKey: 'u2', waiterName: 'Vali', prep: prep.slice(5), delivery: [4 * MIN] }),
      g({ stationId: 's2', productId: 'p2', name: 'Cola', waiterKey: 'u2', waiterName: 'Vali', prep: [30_000, null], delivery: [] }),
    ], stations);
    expect(r.prep.count).toBe(11);
    expect(r.delivery).toMatchObject({ count: 2, avgMs: 3 * MIN });
    const hot = r.byStation.find((s) => s.stationId === 's1')!;
    expect(hot).toMatchObject({ name: 'Issiq sex', kind: 'kitchen' });
    expect(hot.prep).toMatchObject({ count: 10, avgMs: 5.5 * MIN, p90Ms: 9 * MIN, maxMs: 10 * MIN });
    expect(r.byStation[0].stationId).toBe('s1'); // ko'p taomli stansiya birinchi
    // Eng sekin taom birinchi (Osh 5,5 daq > Cola 0,5 daq)
    expect(r.dishes.map((x) => x.name)).toEqual(['Osh', 'Cola']);
    expect(r.dishes[0].prep.count).toBe(10);
    // Yetkazish: Vali 4 daq > Ali 2 daq; yetkazilmagan (bo'sh) guruh qo'shilmaydi
    expect(r.deliveryByWaiter.map((w) => [w.name, w.delivery.avgMs])).toEqual([['Vali', 4 * MIN], ['Ali', 2 * MIN]]);
  });

  it('noma\'lum stansiya nomi — null; manfiy qiymatlar tashlanadi; bo\'sh kirish', () => {
    const r = summarizeKitchen([g({ stationId: 'x', prep: [-5, 60_000] })], stations);
    expect(r.byStation[0]).toMatchObject({ name: null, kind: null, prep: { count: 1 } });
    expect(summarizeKitchen([], stations)).toMatchObject({ prep: { count: 0, avgMs: null }, byStation: [], dishes: [], deliveryByWaiter: [] });
  });
});

describe('summarizeVoids', () => {
  it('jami, yo\'qotish va xodim bo\'yicha (yo\'qotish ko\'pi birinchi)', () => {
    const r = summarizeVoids([
      { voidedBy: 'ali', amount: 45_000, loss: true },
      { voidedBy: 'vali', amount: 90_000, loss: false },
      { voidedBy: 'ali', amount: 10_000, loss: false },
      { voidedBy: 'admin', amount: 5_000, loss: true },
    ]);
    expect(r.totals).toEqual({ count: 4, amount: 150_000, lossCount: 2, lossAmount: 50_000 });
    expect(r.byStaff.map((s) => s.name)).toEqual(['ali', 'admin', 'vali']);
    expect(r.byStaff[0]).toEqual({ name: 'ali', count: 2, amount: 55_000, lossCount: 1, lossAmount: 45_000 });
  });
});

describe('summarizeSales', () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 18, h, m);
  const o = (id: string, over: Partial<SalesOrder>): SalesOrder => ({
    id, type: 'dine_in', waiterKey: 'u1', waiterName: 'Ali', guests: null, openedAt: at(12), paidAt: at(13), ...over,
  });
  it('ofitsant KPI, buyurtma turi, soatlik yuklama', () => {
    const orders = [
      o('a', { guests: 2, openedAt: at(12), paidAt: at(12, 40) }),
      o('b', { guests: 3, openedAt: at(12, 30), paidAt: at(13, 30) }),
      o('c', { waiterKey: 'u2', waiterName: 'Vali', openedAt: at(19), paidAt: at(19, 20) }),
      o('d', { type: 'takeaway', waiterKey: '', waiterName: '', openedAt: at(19, 5), paidAt: at(19, 10) }),
      o('e', { type: 'qr_self', waiterKey: '', waiterName: '', openedAt: at(20), paidAt: null }),
    ];
    const money = new Map([
      ['a', { revenue: 110_000, serviceCharge: 10_000 }],
      ['b', { revenue: 220_000, serviceCharge: 20_000 }],
      ['c', { revenue: 50_000, serviceCharge: 0 }],
      ['d', { revenue: 30_000, serviceCharge: 0 }],
      // e — puli yo'q (masalan Sale bekor qilingan) → 0
    ]);
    const r = summarizeSales(orders, money);
    expect(r.totals).toMatchObject({ orders: 5, revenue: 410_000, avgCheck: 82_000, guests: 5, avgGuests: 2.5, serviceCharge: 30_000 });
    // xizmat vaqti: 40, 60, 20, 5 daq (e — paidAt yo'q) → o'rtacha 31,25 daq
    expect(r.totals.avgServiceMs).toBe(31.25 * MIN);
    expect(r.byWaiter[0]).toMatchObject({ key: 'u1', name: 'Ali', orders: 2, revenue: 330_000, avgCheck: 165_000, guests: 5, avgGuests: 2.5, serviceCharge: 30_000, avgServiceMs: 50 * MIN });
    const none = r.byWaiter.find((w) => w.key === '')!;
    expect(none).toMatchObject({ orders: 2, revenue: 30_000, avgGuests: null, avgServiceMs: 5 * MIN });
    expect(r.byChannel).toEqual([
      { type: 'dine_in', orders: 3, revenue: 380_000, share: 93 },
      { type: 'takeaway', orders: 1, revenue: 30_000, share: 7 },
      { type: 'qr_self', orders: 1, revenue: 0, share: 0 },
    ]);
    expect(r.hourly).toHaveLength(24);
    expect(r.hourly[12]).toEqual({ hour: 12, orders: 2, revenue: 330_000 });
    expect(r.hourly[19]).toEqual({ hour: 19, orders: 2, revenue: 80_000 });
    expect(r.hourly[20].orders).toBe(1);
  });
  it('bo\'sh davr', () => {
    const r = summarizeSales([], new Map());
    expect(r.totals).toMatchObject({ orders: 0, revenue: 0, avgCheck: 0, avgGuests: null, avgServiceMs: null });
    expect(r.byChannel.every((c) => c.share === 0)).toBe(true);
  });
});

describe('fmtDuration', () => {
  const t = { minutes: d.restaurant.common.minutes, hoursMinutes: d.restaurant.reports.hoursMinutes };
  it('daqiqa / kasr / soat', () => {
    expect(fmtDuration(null, t)).toBe('—');
    expect(fmtDuration(7.5 * MIN, t)).toBe('7,5 daq');
    expect(fmtDuration(30_000, t)).toBe('0,5 daq');
    expect(fmtDuration(24 * MIN + 10_000, t)).toBe('24 daq');
    expect(fmtDuration(65 * MIN, t)).toBe('1 soat 5 daq');
  });
});

describe('reportCsv', () => {
  const stats = (avgMs: number | null) => ({ count: avgMs ? 2 : 0, avgMs, medianMs: avgMs, p90Ms: avgMs, maxMs: avgMs });
  const report: RestaurantReport = {
    from: '', to: '', branchId: null, branches: [],
    kitchen: { prep: stats(6 * MIN), delivery: stats(null), byStation: [], dishes: [{ productId: 'p', name: '=Osh', prep: stats(6 * MIN) }], deliveryByWaiter: [] },
    voids: {
      totals: { count: 1, amount: 45_000, lossCount: 1, lossAmount: 45_000 }, byStaff: [], truncated: false,
      rows: [{ orderId: 'o', orderNo: 'B1', tableNumber: 5, type: 'dine_in', waiterName: 'Ali', name: 'Osh', qty: 1, amount: 45_000, voidedAt: new Date(2026, 10, 18, 12, 5).toISOString(), voidedBy: 'ali', reason: 'Kuydi', stage: 'afterCook', loss: true }],
    },
    sales: {
      totals: { orders: 1, revenue: 100, avgCheck: 100, guests: 0, avgGuests: null, serviceCharge: 0, avgServiceMs: null },
      byWaiter: [{ key: '', name: '', orders: 1, revenue: 100, avgCheck: 100, guests: 0, avgGuests: null, serviceCharge: 0, avgServiceMs: null }],
      byChannel: [{ type: 'dine_in', orders: 1, revenue: 100, share: 100 }], topDishes: [], hourly: [], truncated: false,
    },
  };
  it('bo\'limlar, daqiqa ustunlari, formula in\'ektsiyasidan himoya', () => {
    const k = reportCsv(report, 'kitchen', d).split('\n');
    expect(k[0]).toContain(d.restaurant.reports.csv.p90Min);
    expect(k[1]).toBe(`"${d.restaurant.reports.prepTime}","Jami","2","6.0","6.0","6.0","6.0"`);
    expect(k.some((l) => l.includes(`"'=Osh"`))).toBe(true);
    const v = reportCsv(report, 'voids', d).split('\n');
    expect(v[1]).toContain('"18.11.2026, 12:05","ali","B1","5","Ali","Osh","1","45000"');
    expect(v[1]).toContain(d.restaurant.reports.stageAfter);
    const s = reportCsv(report, 'staff', d).split('\n');
    expect(s[1].startsWith(`"${d.restaurant.reports.noWaiter}"`)).toBe(true);
    expect(reportCsv(report, 'sales', d)).toContain(d.restaurant.common.orderTypes.dine_in);
  });
});

/* ───────────────────────────── aggregation (MongoDB) ───────────────────────────── */

const URI = process.env.MONGO_TEST_URI;

describe.skipIf(!URI)('restaurantReport (MongoDB)', () => {
  let conn: mongoose.Connection;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any;
  let mod: typeof import('@/lib/restaurant/reports');
  type PK = import('@/lib/permissions').PermissionKey;
  let features: import('@/lib/features').OrgFeatures;

  const br1 = new Types.ObjectId();
  const br2 = new Types.ObjectId();
  const kitchen = new Types.ObjectId();
  const bar = new Types.ObjectId();
  const osh = new Types.ObjectId();
  const cola = new Types.ObjectId();
  const svc = new Types.ObjectId();
  const day = new Date(2026, 10, 18);
  const at = (h: number, m = 0) => new Date(2026, 10, 18, h, m);
  const range = { from: day, to: new Date(2026, 10, 19) };
  const user = (role: 'admin' | 'user', branchId?: Types.ObjectId) =>
    ({ id: new Types.ObjectId().toString(), username: role === 'admin' ? 'egasi' : 'menejer', role, tokenVersion: 0, dbName: 'test', organizationId: 'org', ...(branchId ? { branchId: String(branchId) } : {}) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (u: ReturnType<typeof user>, perms: PK[]): any => ({ user: u, orgId: 'a'.repeat(24), orgSlug: 'x', m, perms: new Set(perms), features, d });

  const item = (over: Record<string, unknown>) => ({
    _id: new Types.ObjectId(), productId: osh, name: 'Osh', basePrice: 45_000, price: 45_000, qty: 1, modifiers: [],
    stationId: kitchen, stationKind: 'kitchen', status: 'served', stockReserved: true, addedBy: 'ali', addedAt: at(12), ...over,
  });
  const order = (over: Record<string, unknown>) => ({
    _id: new Types.ObjectId(), orderNo: `B${Math.random().toString(36).slice(2, 8)}`, branchId: br1, type: 'dine_in', source: 'waiter',
    status: 'paid', tableNumber: 5, waiterId: 'u1', waiterName: 'Ali', serviceChargePct: 10, packFee: 0, items: [], payments: [],
    openedBy: 'ali', openedAt: at(12), paidAt: at(13), rev: 1, createdAt: at(12), updatedAt: at(13), ...over,
  });
  const sale = (orderId: Types.ObjectId, over: Record<string, unknown>) => ({
    saleNo: `S${Math.random().toString(36).slice(2, 8)}`, productId: osh, productSnapshot: { name: 'Osh (Katta)', imei: 'P1', saleQuantity: 1, purchasePrice: 0 },
    branchId: br1, paymentType: 'cash', totalAmount: 45_000, paidAmount: 45_000, remainingAmount: 0, status: 'paid', soldBy: 'Ali', orderId, createdAt: at(13), ...over,
  });

  beforeAll(async () => {
    conn = await mongoose.createConnection(`${URI}/savora_rest_reports_${Date.now()}`).asPromise();
    const s = {
      Order: (await import('@/lib/models/tenant/Order')).orderSchema,
      KitchenStation: (await import('@/lib/models/tenant/KitchenStation')).kitchenStationSchema,
      Product: (await import('@/lib/models/tenant/Product')).productSchema,
      Sale: (await import('@/lib/models/tenant/Sale')).saleSchema,
      Branch: (await import('@/lib/models/tenant/Branch')).branchSchema,
      User: (await import('@/lib/models/tenant/User')).userSchema,
    };
    m = Object.fromEntries(Object.entries(s).map(([k, schema]) => [k, conn.model(k, schema as mongoose.Schema)]));
    await Promise.all(Object.values(m).map((M) => (M as mongoose.Model<unknown>).init()));
    mod = await import('@/lib/restaurant/reports');
    const { resolveOrgFeatures } = await import('@/lib/features');
    features = resolveOrgFeatures({ plan: { tier: 'pro', maxFilial: 3, maxUsers: 10 }, businessType: 'restaurant' });

    await m.Branch.collection.insertMany([{ _id: br1, name: 'Chilonzor', active: true, createdAt: at(1) }, { _id: br2, name: 'Yunusobod', active: true, createdAt: at(2) }]);
    await m.KitchenStation.collection.insertMany([{ _id: kitchen, branchId: br1, name: 'Issiq sex', kind: 'kitchen', sort: 0, active: true }, { _id: bar, branchId: br1, name: 'Bar', kind: 'bar', sort: 1, active: true }]);
    await m.Product.collection.insertMany([{ _id: osh, name: 'Osh', imei: 'P1', branchId: br1 }, { _id: cola, name: 'Cola', imei: 'P2', branchId: br1 }]);
    // Xodim ismi: hisobotda login («vali») o'rniga ism ko'rsatiladi (lib/staffNames)
    await m.User.collection.insertMany([{ username: 'vali', fullName: 'Vali Karimov', password: 'x', role: 'user', branchId: br1, staff: true, active: true }]);

    const o1 = order({
      guests: 2, openedAt: at(12), paidAt: at(12, 50),
      items: [
        // tayyorlanish 10 daq, yetkazish 2 daq
        item({ sentAt: at(12, 5), cookStartedAt: at(12, 6), readyAt: at(12, 15), servedAt: at(12, 17) }),
        // tayyorlanish 20 daq, yetkazish 4 daq
        item({ sentAt: at(12, 5), readyAt: at(12, 25), servedAt: at(12, 29) }),
        // bar: 2 daq
        item({ productId: cola, name: 'Cola', price: 10_000, basePrice: 10_000, stationId: bar, stationKind: 'bar', sentAt: at(12, 5), readyAt: at(12, 7), servedAt: at(12, 8) }),
        // stansiyasiz (non) — vaqtga kirmaydi
        item({ productId: cola, name: 'Non', stationId: undefined, stationKind: undefined, sentAt: at(12, 5), readyAt: at(12, 5), servedAt: at(12, 5) }),
        // pishgandan keyin bekor — yo'qotish
        item({ status: 'voided', sentAt: at(12, 5), readyAt: at(12, 20), voidedAt: at(12, 30), voidedBy: 'admin', voidReason: 'Kuydi', voidStage: 'afterCook', qty: 2 }),
        // yuborilmagan bekor — hisobotga kirmaydi
        item({ status: 'voided', voidedAt: at(12, 1), voidedBy: 'ali', voidStage: 'unsent' }),
      ],
    });
    const o2 = order({ waiterId: 'u2', waiterName: 'Vali', openedAt: at(19), paidAt: at(19, 30), updatedAt: at(19, 30),
      items: [item({ status: 'voided', sentAt: at(19, 1), voidedAt: at(19, 3), voidedBy: 'vali', voidReason: 'Mijoz rad etdi', voidStage: 'beforeCook' })] });
    const o3 = order({ type: 'takeaway', waiterId: undefined, waiterName: undefined, tableNumber: undefined, openedAt: at(19, 10), paidAt: at(19, 15), updatedAt: at(19, 15) });
    // Kecha yopilgan — davrga kirmaydi; ochiq buyurtma — savdoga kirmaydi, vaqtga kiradi
    const old = order({ openedAt: new Date(2026, 10, 17, 12), paidAt: new Date(2026, 10, 17, 13), updatedAt: new Date(2026, 10, 17, 13) });
    const open = order({ status: 'open', paidAt: undefined, updatedAt: at(14), items: [item({ status: 'ready', sentAt: at(14), readyAt: at(14, 30) })] });
    // Boshqa filial
    const other = order({ branchId: br2, waiterName: 'Sobir', waiterId: 'u9', openedAt: at(12), paidAt: at(13) });
    await m.Order.collection.insertMany([o1, o2, o3, old, open, other]);

    await m.Sale.collection.insertMany([
      sale(o1._id, { totalAmount: 90_000, productSnapshot: { name: 'Osh (Katta)', imei: 'P1', saleQuantity: 2 } }),
      sale(o1._id, { productId: cola, totalAmount: 10_000, productSnapshot: { name: 'Cola', imei: 'P2', saleQuantity: 1 } }),
      sale(o1._id, { productId: svc, totalAmount: 10_000, productSnapshot: { name: 'Xizmat haqi (10%)', imei: 'XIZMAT', saleQuantity: 1 } }),
      // Sotuvlar bo'limida bekor qilingan — kirmaydi
      sale(o1._id, { totalAmount: 45_000, status: 'cancelled' }),
      sale(o2._id, { productId: cola, totalAmount: 20_000, productSnapshot: { name: 'Cola', imei: 'P2', saleQuantity: 2 } }),
      sale(o3._id, { totalAmount: 45_000 }),
      sale(o3._id, { productId: svc, totalAmount: 2_000, productSnapshot: { name: 'Qadoq', imei: 'QADOQ', saleQuantity: 1 } }),
      sale(old._id, { totalAmount: 999_000 }),
      sale(other._id, { branchId: br2, totalAmount: 70_000 }),
    ]);
  });

  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  it('huquq va modul', async () => {
    expect(await mod.restaurantReport(ctx(user('admin'), ['export.data']), range)).toMatchObject({ ok: false, code: 'noPermission' });
    expect(await mod.restaurantReport(ctx(user('admin'), ['reports.view']), { from: new Date(2026, 0, 1), to: range.to })).toMatchObject({ ok: false, code: 'badInput' });
  });

  it('filial xodimi — faqat o\'z filiali; boshqasi so\'ralsa — badBranch', async () => {
    const c = ctx(user('user', br1), ['reports.view']);
    expect(await mod.restaurantReport(c, { ...range, branchId: String(br2) })).toMatchObject({ ok: false, code: 'badBranch' });
    const r = await mod.restaurantReport(c, range);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.branches).toEqual([]);
    expect(r.data.sales.byWaiter.map((w) => w.name)).not.toContain('Sobir');
  });

  it('egasi: barcha filiallar va tanlangan filial', async () => {
    const all = await mod.restaurantReport(ctx(user('admin'), ['reports.view']), range);
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    expect(all.data.branches.map((b) => b.name)).toEqual(['Chilonzor', 'Yunusobod']);
    expect(all.data.sales.totals).toMatchObject({ orders: 4, revenue: 110_000 + 20_000 + 47_000 + 70_000 });

    const r = await mod.restaurantReport(ctx(user('admin'), ['reports.view']), { ...range, branchId: String(br1) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { kitchen: k, voids: v, sales: s } = r.data;

    // Vaqtlar: o1 (10, 20, bar 2) + ochiq buyurtma (30) — stansiyasiz va bekor qilingan kirmaydi
    expect(k.prep).toMatchObject({ count: 4, avgMs: 15.5 * MIN, p90Ms: 30 * MIN, maxMs: 30 * MIN });
    expect(k.delivery).toMatchObject({ count: 3 });
    expect(k.byStation.map((x) => [x.name, x.kind, x.prep.count])).toEqual([['Issiq sex', 'kitchen', 3], ['Bar', 'bar', 1]]);
    expect(k.dishes.map((x) => x.name)).toEqual(['Osh', 'Cola']);
    expect(k.dishes[0].prep).toMatchObject({ count: 3, avgMs: 20 * MIN });
    expect(k.deliveryByWaiter).toHaveLength(1);
    expect(k.deliveryByWaiter[0]).toMatchObject({ key: 'u1', name: 'Ali', delivery: { count: 3 } });

    // Bekor qilinganlar: yuborilmagani kirmaydi; pishgandan keyingisi — yo'qotish
    expect(v.totals).toEqual({ count: 2, amount: 90_000 + 45_000, lossCount: 1, lossAmount: 90_000 });
    expect(v.rows[0]).toMatchObject({ voidedBy: 'Vali Karimov', stage: 'beforeCook', loss: false, reason: 'Mijoz rad etdi', waiterName: 'Vali' });
    expect(v.rows[1]).toMatchObject({ voidedBy: 'admin', stage: 'afterCook', loss: true, amount: 90_000, tableNumber: 5, qty: 2 });
    expect(v.byStaff[0]).toMatchObject({ name: 'admin', lossAmount: 90_000 });

    // Savdo: bekor qilingan Sale kirmaydi, xizmat haqi alohida, qadoq tushumda
    expect(s.totals).toMatchObject({ orders: 3, revenue: 177_000, serviceCharge: 10_000, guests: 2 });
    expect(s.byWaiter.map((w) => [w.name, w.orders, w.revenue])).toEqual([['Ali', 1, 110_000], ['', 1, 47_000], ['Vali', 1, 20_000]]);
    expect(s.byWaiter[0]).toMatchObject({ avgServiceMs: 50 * MIN, serviceCharge: 10_000 });
    expect(s.byChannel.find((c) => c.type === 'takeaway')).toMatchObject({ orders: 1, revenue: 47_000 });
    // Top taomlar: tizim qatorlari (XIZMAT/QADOQ) yo'q; nom — mahsulotning hozirgi nomi
    expect(s.topDishes.map((x) => [x.name, x.qty, x.revenue])).toEqual([['Osh', 3, 135_000], ['Cola', 3, 30_000]]);
    expect(s.hourly[12].orders).toBe(1);
    expect(s.hourly[19].orders).toBe(2);
  });
});
