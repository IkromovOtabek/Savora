/**
 * Ofitsant kabineti «Mening kunim» (lib/restaurant/waiterDay.ts), «Ofitsantlar» jadvali (reports.ts → waiterTable)
 * va xodim qo'shish rol tanlovi (lib/staffRoles.ts):
 *  - sof hisoblash: davr (Toshkent kuni), KPI, ro'yxat tartibi, jadval birlashmasi, CSV, rol tartibi, render;
 *  - MongoDB (MONGO_TEST_URI berilsa): MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/waiterDay.test.ts —
 *    ikki ofitsant, bo'lib to'lash, bekor qilingan taom, davr chegaralari, filial chegarasi, faqat o'z ma'lumoti.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock('@/lib/onboarding', () => ({ markOnboardingStep: vi.fn(async () => {}) }));
vi.mock('@/lib/shopNotify', () => ({ notifyNewSale: vi.fn(async () => {}), salePayLabel: () => 'naqd' }));

import {
  WAITER_CLOSED_SHOWN, parseWaiterDayPeriod, sortOpenOrders, summarizeWaiterDay, waiterDayRange, type WaiterDay,
} from '@/lib/restaurant/waiterDay';
import { reportCsv, waiterTable, type ClosedOrder, type RestaurantReport, type VoidRow, type WaiterKpi } from '@/lib/restaurant/reports';
import { RESTAURANT_ROLE_NAMES, ROLE_HINT_KEYS, staffRoleOptions } from '@/lib/staffRoles';
import { DEFAULT_ROLES, RESTAURANT_ROLES } from '@/lib/models/tenant/Role';
import WaiterDayView from '@/components/restaurant/waiter/WaiterDayView';
import { getDictionary } from '@/lib/i18n/dict';
import { fmtMoney } from '@/lib/format';

const d = getDictionary('uz');
const ru = getDictionary('ru');
const MIN = 60_000;

/* ───────────────────────────── davr ───────────────────────────── */

describe('davr — Toshkent kuni (UTC+5)', () => {
  it('noma\'lum qiymat — bugun', () => {
    expect(parseWaiterDayPeriod('week')).toBe('week');
    expect(parseWaiterDayPeriod('month')).toBe('month');
    expect(parseWaiterDayPeriod('year')).toBe('today');
    expect(parseWaiterDayPeriod(undefined)).toBe('today');
    expect(parseWaiterDayPeriod({ $ne: 1 })).toBe('today');
  });

  it('UTC 20:30 — Toshkentda ertasi kun 01:30: «bugun» ertasi kun', () => {
    const now = new Date('2026-11-20T20:30:00.000Z');
    const t = waiterDayRange('today', now);
    expect(t.from.toISOString()).toBe('2026-11-20T19:00:00.000Z');
    expect(t.to.toISOString()).toBe('2026-11-21T19:00:00.000Z');
    expect([t.fromDay, t.toDay]).toEqual(['2026-11-21', '2026-11-21']);
    const w = waiterDayRange('week', now);
    expect(w.from.toISOString()).toBe('2026-11-14T19:00:00.000Z');
    expect([w.fromDay, w.toDay]).toEqual(['2026-11-15', '2026-11-21']);
    const m = waiterDayRange('month', now);
    expect(m.fromDay).toBe('2026-10-23');
    expect((m.to.getTime() - m.from.getTime()) / 86_400_000).toBe(30);
  });
});

/* ───────────────────────────── KPI ───────────────────────────── */

const closed = (id: string, over: Partial<ClosedOrder> = {}): ClosedOrder => ({
  id, orderNo: `B-${id}`, type: 'dine_in', tableNumber: 5, waiterKey: 'u1', waiterName: 'Ali', guests: 2,
  openedAt: new Date('2026-11-20T07:00:00Z'), paidAt: new Date('2026-11-20T08:00:00Z'), ...over,
});

describe('summarizeWaiterDay', () => {
  it('hisoblar, sotuv, o\'rtacha chek, mehmonlar, xizmat haqi, bekor qilinganlar', () => {
    const orders = [
      closed('a', { guests: 3, paidAt: new Date('2026-11-20T09:00:00Z') }),
      closed('b', { guests: null, tableNumber: null, type: 'takeaway', paidAt: new Date('2026-11-20T11:00:00Z') }),
      closed('c', { guests: 2, paidAt: new Date('2026-11-20T10:00:00Z') }),
    ];
    const money = new Map([
      ['a', { revenue: 110_000, serviceCharge: 10_000 }],
      ['b', { revenue: 47_000, serviceCharge: 0 }],
      // c — puli yo'q (masalan, Sale bekor qilingan) — 0
    ]);
    const voids = [{ amount: 45_000, loss: true }, { amount: 10_000, loss: false }];
    const r = summarizeWaiterDay(orders, money, voids);
    expect(r.totals).toEqual({
      orders: 3, revenue: 157_000, avgCheck: Math.round(157_000 / 3), guests: 5, guestsMissing: 1, serviceCharge: 10_000,
      voids: 2, voidAmount: 55_000, lossCount: 1,
    });
    // Eng yangisi birinchi; summa — shu hisobning puli
    expect(r.closed.map((b) => [b.id, b.total])).toEqual([['b', 47_000], ['c', 0], ['a', 110_000]]);
    expect(r.closed[0]).toMatchObject({ tableNumber: null, type: 'takeaway', paidAt: '2026-11-20T11:00:00.000Z' });
  });

  it('bo\'sh davr; ro\'yxat chegarasi', () => {
    expect(summarizeWaiterDay([], new Map(), []).totals).toMatchObject({ orders: 0, revenue: 0, avgCheck: 0, voids: 0 });
    const many = Array.from({ length: WAITER_CLOSED_SHOWN + 5 }, (_, i) => closed(`x${i}`, { paidAt: new Date(Date.UTC(2026, 10, 20, 8, i)) }));
    const r = summarizeWaiterDay(many, new Map(), []);
    expect(r.totals.orders).toBe(WAITER_CLOSED_SHOWN + 5);
    expect(r.closed).toHaveLength(WAITER_CLOSED_SHOWN);
    expect(r.closed[0].id).toBe(`x${WAITER_CLOSED_SHOWN + 4}`);
  });

  it('ochiq stollar: raqam bo\'yicha, keyin saboy (ochilgan vaqti)', () => {
    const list = [
      { id: 's2', tableNumber: null, openedAt: '2026-11-20T09:00:00Z' },
      { id: 't7', tableNumber: 7, openedAt: '2026-11-20T08:00:00Z' },
      { id: 's1', tableNumber: null, openedAt: '2026-11-20T08:30:00Z' },
      { id: 't2', tableNumber: 2, openedAt: '2026-11-20T10:00:00Z' },
    ];
    expect(sortOpenOrders(list).map((x) => x.id)).toEqual(['t2', 't7', 's1', 's2']);
  });
});

/* ───────────────────────────── «Ofitsantlar» jadvali ───────────────────────────── */

const kpi = (key: string, name: string, revenue: number): WaiterKpi => ({
  key, name, orders: 1, revenue, avgCheck: revenue, guests: 2, avgGuests: 2, serviceCharge: 0, avgServiceMs: 30 * MIN,
});
const vrow = (waiterKey: string, waiterName: string, amount: number, loss: boolean): Pick<VoidRow, 'waiterKey' | 'waiterName' | 'amount' | 'loss'> =>
  ({ waiterKey, waiterName, amount, loss });

describe('waiterTable', () => {
  it('KPI + bekor qilinganlar (kalit bo\'yicha); faqat bekori bor ofitsant — oxirida', () => {
    const rows = waiterTable(
      [kpi('u1', 'Ali', 200_000), kpi('u2', 'Vali', 100_000), kpi('', '', 50_000)],
      [vrow('u1', 'Ali', 45_000, true), vrow('u1', 'Ali', 10_000, false), vrow('u3', 'Sobir', 8_000, false), vrow('', '', 3_000, false)],
    );
    expect(rows.map((r) => [r.key, r.name, r.revenue, r.voids, r.voidAmount, r.lossCount])).toEqual([
      ['u1', 'Ali', 200_000, 2, 55_000, 1],
      ['u2', 'Vali', 100_000, 0, 0, 0],
      ['', '', 50_000, 1, 3_000, 0],
      ['u3', 'Sobir', 0, 1, 8_000, 0],
    ]);
    expect(rows[3]).toMatchObject({ orders: 0, avgCheck: 0, avgGuests: null, avgServiceMs: null });
  });

  it('CSV «staff» bo\'limida bekor qilingan ustunlari', () => {
    const report: RestaurantReport = {
      from: '', to: '', branchId: null, branches: [],
      kitchen: { prep: { count: 0, avgMs: null, medianMs: null, p90Ms: null, maxMs: null }, delivery: { count: 0, avgMs: null, medianMs: null, p90Ms: null, maxMs: null }, byStation: [], dishes: [], deliveryByWaiter: [] },
      voids: { totals: { count: 1, amount: 45_000, lossCount: 1, lossAmount: 45_000 }, byStaff: [], truncated: false, rows: [{ orderId: 'o', orderNo: 'B1', tableNumber: 5, type: 'dine_in', waiterName: 'Ali', name: 'Osh', qty: 1, amount: 45_000, voidedAt: '2026-11-20T08:00:00.000Z', voidedBy: 'Admin', reason: 'Kuydi', stage: 'afterCook', loss: true, waiterKey: 'u1' }] },
      sales: {
        totals: { orders: 1, revenue: 100, avgCheck: 100, guests: 0, avgGuests: null, serviceCharge: 0, avgServiceMs: null },
        byWaiter: [{ key: 'u1', name: 'Ali', orders: 1, revenue: 100, avgCheck: 100, guests: 0, avgGuests: null, serviceCharge: 0, avgServiceMs: null }],
        byChannel: [], topDishes: [], hourly: [], truncated: false,
      },
    };
    const lines = reportCsv(report, 'staff', d).split('\n');
    expect(lines[0]).toContain(`"${d.waiterDay.report.colVoids}","${d.waiterDay.report.colVoidAmount}"`);
    expect(lines[1]).toBe('"Ali","1","100","100","0","","0","","1","45000"');
    expect(lines[2].endsWith('"1","45000"')).toBe(true);
  });
});

/* ───────────────────────────── xodim qo'shish: rollar ───────────────────────────── */

describe('staffRoleOptions', () => {
  it('shablon nomlari Role.ts bilan mos', () => {
    expect([...RESTAURANT_ROLE_NAMES]).toEqual(RESTAURANT_ROLES.map((r) => r.name));
    for (const r of [...RESTAURANT_ROLES, ...DEFAULT_ROLES]) expect(ROLE_HINT_KEYS[r.name]).toBeTruthy();
  });

  it('restoran rollari birinchi (shablon tartibida, izoh bilan), qolganlari — nomi bo\'yicha', () => {
    const roles = ['Sotuvchi', 'Administrator', 'Kassir', 'Oshpaz', 'Barmen', 'Ofitsant', 'Kassir (restoran)', 'Menejer', 'Hostes']
      .map((name, i) => ({ id: `r${i}`, name, permissions: ['a', 'b', 'c'] }));
    const opts = staffRoleOptions(roles, d.waiterDay.staff);
    expect(opts.map((o) => [o.name, o.group])).toEqual([
      ['Ofitsant', 'restaurant'], ['Oshpaz', 'restaurant'], ['Barmen', 'restaurant'], ['Kassir (restoran)', 'restaurant'], ['Administrator', 'restaurant'],
      ['Hostes', 'other'], ['Kassir', 'other'], ['Menejer', 'other'], ['Sotuvchi', 'other'],
    ]);
    expect(opts[0].hint).toBe(d.waiterDay.staff.hints.waiter);
    expect(opts.find((o) => o.name === 'Hostes')?.hint).toBe('3 ta huquq');
    expect(staffRoleOptions(roles, ru.waiterDay.staff)[0].hint).toBe(ru.waiterDay.staff.hints.waiter);
  });

  it('restoran bo\'lmagan do\'kon — hammasi «other» (forma oddiy ro\'yxatni ko\'rsatadi)', () => {
    const opts = staffRoleOptions(DEFAULT_ROLES.map((r, i) => ({ id: `r${i}`, name: r.name, permissions: r.permissions })), d.waiterDay.staff);
    expect(opts.every((o) => o.group === 'other')).toBe(true);
  });
});

/* ───────────────────────────── render ───────────────────────────── */

describe('WaiterDayView', () => {
  const data: WaiterDay = {
    period: 'today', from: '2026-11-19T19:00:00.000Z', to: '2026-11-20T19:00:00.000Z', fromDay: '2026-11-20', toDay: '2026-11-20',
    name: 'Aziz Karimov', serverTime: '2026-11-20T09:05:00.000Z',
    totals: { orders: 2, revenue: 157_000, avgCheck: 78_500, guests: 3, guestsMissing: 1, serviceCharge: 10_000, voids: 1, voidAmount: 45_000, lossCount: 1 },
    open: [{
      id: 'o7', orderNo: 'B20261120-0007', type: 'dine_in', status: 'open', source: 'waiter', tableId: 't7', tableNumber: 7, guests: 4,
      waiterId: 'u1', waiterName: 'Aziz Karimov', openedAt: '2026-11-20T08:30:00.000Z', updatedAt: null, access: true, mine: true,
      total: 90_000, due: 99_000, counts: { items: 3, pending: 1, unsent: 0, active: 3, ready: 2, voided: 0, unpaid: 3 },
    }],
    closed: [{ id: 'c1', orderNo: 'B20261120-0003', type: 'takeaway', tableNumber: null, guests: null, paidAt: '2026-11-20T07:15:00.000Z', total: 47_000 }],
    truncated: false,
  };

  it('ko\'rsatkichlar, ochiq stol havolasi, yopilgan hisob — Toshkent vaqti', () => {
    const html = renderToStaticMarkup(createElement(WaiterDayView, { data, d }));
    expect(html).toContain(d.waiterDay.title);
    expect(html).toContain('Aziz Karimov');
    expect(html).toContain(fmtMoney(157_000));
    expect(html).toContain('href="/app/tables/o7"');
    expect(html).toContain('2 ta tayyor');
    expect(html).toContain('QR: 1 ta tasdiqlang');
    expect(html).toContain(fmtMoney(99_000));
    // 07:15Z → 12:15 Toshkent; saboy
    expect(html).toContain('12:15');
    expect(html).toContain(d.waiterDay.takeaway);
    expect(html).toContain('href="/app/tables/me?p=week"');
    expect(html).toContain(d.waiterDay.voidsLoss.replace('{n}', '1'));
  });

  it('bo\'sh holat (ru)', () => {
    const empty = { ...data, open: [], closed: [], totals: { ...data.totals, orders: 0, voids: 0, lossCount: 0 } };
    const html = renderToStaticMarkup(createElement(WaiterDayView, { data: empty, d: ru }));
    expect(html).toContain(ru.waiterDay.openEmpty);
    expect(html).toContain(ru.waiterDay.closedEmpty);
    expect(html).toContain(ru.waiterDay.voidsNone);
  });
});

/* ───────────────────────────── MongoDB ───────────────────────────── */

const URI = process.env.MONGO_TEST_URI;

describe.skipIf(!URI)('waiterDay (MongoDB)', () => {
  let conn: mongoose.Connection;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any;
  let ops: typeof import('@/lib/restaurant/ops');
  let setup: typeof import('@/lib/restaurant/setup');
  let wd: typeof import('@/lib/restaurant/waiterDay');
  let reports: typeof import('@/lib/restaurant/reports');
  let features: import('@/lib/features').OrgFeatures;
  type PK = import('@/lib/permissions').PermissionKey;

  const br1 = new Types.ObjectId();
  const br2 = new Types.ObjectId();
  const ids = {
    admin: new Types.ObjectId().toString(),
    ali: new Types.ObjectId().toString(),
    vali: new Types.ObjectId().toString(),
    timur: new Types.ObjectId().toString(),
    kassir: new Types.ObjectId().toString(),
  };
  const user = (id: string, username: string, role: 'admin' | 'user' = 'user', branchId: Types.ObjectId = br1) =>
    ({ id, username, role, tokenVersion: 0, dbName: 'test', organizationId: 'org', ...(role === 'user' ? { branchId: String(branchId) } : {}) });
  const WAITER: PK[] = ['order.create', 'tasks.view'];
  const CASHIER: PK[] = ['sale.create', 'order.create', 'order.viewAll', 'order.split'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (u: ReturnType<typeof user>, perms: PK[], f = features): any => ({ user: u, orgId: 'a'.repeat(24), orgSlug: 'x', m, perms: new Set(perms), features: f, d });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let admin: any, ali: any, vali: any, kassir: any, timur: any;
  const P: Record<string, string> = {};
  let tables: string[] = [];

  beforeAll(async () => {
    conn = await mongoose.createConnection(`${URI}/savora_waiter_day_${Date.now()}`).asPromise();
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
    wd = await import('@/lib/restaurant/waiterDay');
    reports = await import('@/lib/restaurant/reports');
    const { resolveOrgFeatures } = await import('@/lib/features');
    const { PERMISSION_KEYS } = await import('@/lib/permissions');
    features = resolveOrgFeatures({ plan: { tier: 'pro', maxFilial: 3, maxUsers: 10 }, businessType: 'restaurant' });
    admin = ctx(user(ids.admin, 'egasi', 'admin'), [...PERMISSION_KEYS]);
    ali = ctx(user(ids.ali, 'ali'), WAITER);
    vali = ctx(user(ids.vali, 'vali'), WAITER);
    kassir = ctx(user(ids.kassir, 'kassir'), CASHIER);
    timur = ctx(user(ids.timur, 'timur'), WAITER);

    await m.Branch.create([{ _id: br1, name: 'Chilonzor', active: true }, { _id: br2, name: 'Yunusobod', active: true }]);
    await m.User.create([
      { _id: ids.ali, username: 'ali', fullName: 'Ali Valiyev', password: 'x', role: 'user', branchId: br1, staff: true, active: true },
      { _id: ids.vali, username: 'vali', fullName: 'Vali Karimov', password: 'x', role: 'user', branchId: br1, staff: true, active: true },
    ]);
    await m.ShopSettings.create({ key: 'main', restaurant: { serviceChargePct: 10, takeawayPackFee: 2000, requireVoidReason: true } });
    const hall = await setup.saveHall(admin, { name: 'Asosiy zal', branchId: String(br1) });
    const hallId = hall.ok ? hall.data.id : '';
    await setup.createTablesRange(admin, { hallId, from: 5, to: 8, seats: 4 });
    tables = (await m.Table.find({ branchId: br1 }).sort({ number: 1 }).lean()).map((t: { _id: unknown }) => String(t._id));
    const st = await setup.saveStation(admin, { name: 'Issiq sex', kind: 'kitchen', branchId: String(br1) });
    const stationId = st.ok ? st.data.id : '';
    const mk = (over: Record<string, unknown>) => m.Product.create({
      imei: `P${Math.random().toString(36).slice(2, 10)}`, purchasePrice: 1000, salePrice: 1000, branchId: br1, status: 'in_stock', menuItem: true, ...over,
    });
    const osh = await mk({ name: 'Osh', kind: 'service', salePrice: 45_000 });
    const choy = await mk({ name: 'Choy', kind: 'service', salePrice: 5_000 });
    Object.assign(P, { osh: String(osh._id), choy: String(choy._id) });
    expect((await setup.updateMenuItem(admin, P.osh, { stationId })).ok).toBe(true);
    // Choy ham oshxonaga (stansiyali) — yuborilgach «sent»: bekor qilish — pishishidan oldin (beforeCook)
    expect((await setup.updateMenuItem(admin, P.choy, { stationId })).ok).toBe(true);
  });

  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  /** Stol ochish → taomlar → yuborish; buyurtma id */
  async function openWith(c: unknown, tableId: string, guests: number, items: { productId: string; qty: number }[]): Promise<string> {
    const o = await ops.openOrder(c as never, { type: 'dine_in', tableId, guests });
    expect(o.ok).toBe(true);
    if (!o.ok) throw new Error(o.error);
    const id = o.data.order.id;
    expect((await ops.addItems(c as never, id, items)).ok).toBe(true);
    expect((await ops.sendItems(c as never, id)).ok).toBe(true);
    return id;
  }

  it('ikki ofitsant: bo\'lib to\'lash, bekor qilingan taom, ochiq stol — har kim faqat o\'zinikini ko\'radi', async () => {
    // Ali — 5-stol: Osh ×2, Choy ×1 (3 mehmon); Choy oshxonaga ketdi va bekor qilindi (yuborilgandan keyin)
    const a5 = await openWith(ali, tables[0], 3, [{ productId: P.osh, qty: 2 }, { productId: P.choy, qty: 1 }]);
    const order = await m.Order.findById(a5).lean();
    const choyItem = order.items.find((i: { name: string }) => i.name === 'Choy');
    const oshItem = order.items.find((i: { name: string }) => i.name === 'Osh');
    expect(await ops.voidItem(admin, a5, { itemId: String(choyItem._id), reason: 'Mijoz voz kechdi' })).toMatchObject({ ok: true });
    // Bo'lib to'lash: 1 Osh (49 500 = 45 000 + 10%), keyin qolgani
    const p1 = await ops.payOrder(kassir, a5, { items: [{ itemId: String(oshItem._id), qty: 1 }], parts: [{ method: 'cash', amount: 49_500 }] });
    expect(p1).toMatchObject({ ok: true, data: { total: 49_500, closed: false } });
    const p2 = await ops.payOrder(kassir, a5, { parts: [{ method: 'uzcard', amount: 49_500 }] });
    expect(p2).toMatchObject({ ok: true, data: { total: 49_500, closed: true } });
    // Ali — 6-stol ochiq (tayyor taom bilan)
    const a6 = await openWith(ali, tables[1], 2, [{ productId: P.osh, qty: 1 }]);
    const a6doc = await m.Order.findById(a6).lean();
    expect((await ops.bumpItems(admin, a6, { itemIds: [String(a6doc.items[0]._id)], to: 'ready' })).ok).toBe(true);
    // Vali — 7-stol yopildi, 8-stol ochiq
    const v7 = await openWith(vali, tables[2], 4, [{ productId: P.osh, qty: 1 }]);
    expect((await ops.payOrder(kassir, v7, { parts: [{ method: 'cash', amount: 49_500 }] })).ok).toBe(true);
    await openWith(vali, tables[3], 1, [{ productId: P.choy, qty: 1 }]);

    const r = await wd.waiterDay(ali, { period: 'today' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.name).toBe('Ali Valiyev');
    // 1 hisob (ikki qism bilan) = 99 000: taomlar 90 000 + xizmat haqi 9 000; bekor qilingan Choy pulga kirmaydi
    expect(r.data.totals).toEqual({
      orders: 1, revenue: 99_000, avgCheck: 99_000, guests: 3, guestsMissing: 0, serviceCharge: 9_000,
      voids: 1, voidAmount: 5_000, lossCount: 0,
    });
    expect(r.data.closed).toHaveLength(1);
    expect(r.data.closed[0]).toMatchObject({ id: a5, tableNumber: 5, guests: 3, total: 99_000 });
    expect(r.data.open.map((o) => [o.id, o.tableNumber, o.mine, o.counts?.ready])).toEqual([[a6, 6, true, 1]]);
    expect(r.data.open[0].due).toBe(49_500);

    const v = await wd.waiterDay(vali, { period: 'today' });
    expect(v.ok && v.data.totals).toMatchObject({ orders: 1, revenue: 49_500, guests: 4, voids: 0 });
    expect(v.ok && v.data.open.map((o) => o.tableNumber)).toEqual([8]);
    expect(v.ok && v.data.closed.map((b) => b.id)).toEqual([v7]);

    // Rahbar jadvali: ofitsant kaliti (waiterId) sotuv va bekor qilinganlarda bir xil — Ali qatorida 1 bekor
    const now = new Date();
    const rep = await reports.restaurantReport(admin, { from: new Date(now.getTime() - 86_400_000), to: new Date(now.getTime() + 60_000), branchId: String(br1) });
    expect(rep.ok).toBe(true);
    if (!rep.ok) return;
    const rows = reports.waiterTable(rep.data.sales.byWaiter, rep.data.voids.rows);
    expect(rows.map((x) => [x.name, x.orders, x.revenue, x.voids])).toEqual([['Ali Valiyev', 1, 99_000, 1], ['Vali Karimov', 1, 49_500, 0]]);
  });

  it('huquq, modul va filial chegarasi', async () => {
    expect(await wd.waiterDay(ctx(user(ids.ali, 'ali'), ['kitchen.view']), {})).toMatchObject({ ok: false, code: 'noPermission' });
    expect(await wd.waiterDay(ctx(user(ids.ali, 'ali'), WAITER, { ...features, tables: false }), {})).toMatchObject({ ok: false, code: 'moduleOff' });
    // Xodim boshqa filialni so'rasa — rad
    expect(await wd.waiterDay(ali, { branchId: String(br2) })).toMatchObject({ ok: false, code: 'badBranch' });
    // Ali boshqa filialga o'tkazilgan (sessiya yangi filial bilan) — eski filialdagi hisoblari ko'rinmaydi
    const moved = await wd.waiterDay(ctx(user(ids.ali, 'ali', 'user', br2), WAITER), { period: 'today' });
    expect(moved.ok && moved.data.totals.orders).toBe(0);
    expect(moved.ok && moved.data.open).toEqual([]);
  });

  it('davr chegaralari — Toshkent kuni; hafta va oy', async () => {
    // Timur: 2025-03-10 (Toshkent) — «bugun» = 2025-03-09T19:00Z … 2025-03-10T19:00Z
    const now = new Date('2025-03-10T10:00:00.000Z');
    const paid = (paidAt: string, total: number) => {
      const _id = new Types.ObjectId();
      return {
        order: {
          _id, orderNo: `T${Math.random().toString(36).slice(2, 8)}`, branchId: br1, type: 'dine_in', source: 'waiter', status: 'paid',
          tableNumber: 9, waiterId: ids.timur, waiterName: 'timur', guests: 1, serviceChargePct: 0, packFee: 0, items: [], payments: [],
          openedBy: 'timur', openedAt: new Date(new Date(paidAt).getTime() - 30 * MIN), paidAt: new Date(paidAt), rev: 1,
          createdAt: new Date(paidAt), updatedAt: new Date(paidAt),
        },
        sale: {
          saleNo: `S${Math.random().toString(36).slice(2, 8)}`, productId: new Types.ObjectId(),
          productSnapshot: { name: 'Osh', imei: 'P1', saleQuantity: 1, purchasePrice: 0 }, branchId: br1, paymentType: 'cash',
          totalAmount: total, paidAmount: total, remainingAmount: 0, status: 'paid', soldBy: 'timur', orderId: _id, createdAt: new Date(paidAt),
        },
      };
    };
    const rows = [
      paid('2025-03-09T19:30:00.000Z', 1_000), // Toshkent 10-mart 00:30 — bugun (UTC bo'yicha 9-mart)
      paid('2025-03-09T18:59:00.000Z', 2_000), // Toshkent 9-mart 23:59 — kecha: hafta
      paid('2025-03-03T19:00:00.000Z', 4_000), // Toshkent 4-mart 00:00 — haftaning birinchi kuni
      paid('2025-03-03T18:59:00.000Z', 8_000), // Toshkent 3-mart 23:59 — haftadan tashqari, oyda
      paid('2025-02-08T18:59:00.000Z', 16_000), // oydan ham tashqari (30 kun: 9-fevral … 10-mart)
    ];
    await m.Order.collection.insertMany(rows.map((x) => x.order));
    await m.Sale.collection.insertMany(rows.map((x) => x.sale));

    const sum = async (period: string) => {
      const r = await wd.waiterDay(timur, { period, now });
      if (!r.ok) throw new Error(r.error);
      return [r.data.totals.orders, r.data.totals.revenue];
    };
    expect(await sum('today')).toEqual([1, 1_000]);
    expect(await sum('week')).toEqual([3, 7_000]);
    expect(await sum('month')).toEqual([4, 15_000]);
    const r = await wd.waiterDay(timur, { period: 'week', now });
    expect(r.ok && [r.data.fromDay, r.data.toDay]).toEqual(['2025-03-04', '2025-03-10']);
  });

  it('egasi ham buyurtma olsa — o\'z hisoblari (barcha filiallar), boshqalarniki emas', async () => {
    const o = await openWith(admin, tables[0], 2, [{ productId: P.choy, qty: 2 }]);
    expect((await ops.payOrder(admin, o, { parts: [{ method: 'cash', amount: 11_000 }] })).ok).toBe(true);
    const r = await wd.waiterDay(admin, { period: 'today' });
    expect(r.ok && r.data.totals).toMatchObject({ orders: 1, revenue: 11_000, serviceCharge: 1_000 });
    expect(r.ok && r.data.closed.map((b) => b.id)).toEqual([o]);
    // Tanlangan filial — boshqa filialda uning hisobi yo'q
    const other = await wd.waiterDay(admin, { period: 'today', branchId: String(br2) });
    expect(other.ok && other.data.totals.orders).toBe(0);
  });
});
