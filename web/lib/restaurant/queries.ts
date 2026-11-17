/**
 * Restoran — o'qish so'rovlari (server, DB): stollar taxtasi, buyurtmalar ro'yxati, oshxona ekrani (KDS),
 * xodim menyusi, sozlamalar ko'rinishi, ofitsantlar, vaqt hisobotlari. Web JSON API, mobil API va
 * server komponentlar (UI agentlari) shu funksiyalarni chaqiradi. Polling uchun yengil: faqat kerakli maydonlar.
 */
import type { Types } from 'mongoose';
import type { OrderDoc } from '../models/tenant/Order';
import type { IProduct } from '../models/tenant/Product';
import { sellableInfo, SERVICE_AVAILABLE } from '../productKinds';
import { resolvePublicFileUrl } from '../fileUrl';
import { siteUrl } from '../siteUrl';
import { canAccessOrder } from './rules';
import { itemDisplayName } from './modifiers';
import { kdsLevel, summarizeTimings, type TimedItem } from './timings';
import { qrMenuPath } from './qr';
import { KDS_STATUSES, type ItemStatus, type OrderSource, type RestaurantSettings, type StationKind } from './types';
import { fail, needAnyPerm, needFeature, needPerm, ok, type OpResult, type RestaurantCtx, type RestaurantModels } from './context';
import { loadOrder, orderViewFor, resolveBranchId, restaurantSettings } from './ops';
import { orderSummary, type OrderSummary, type OrderView } from './view';

const iso = (d?: Date | string | null): string | null => (d ? new Date(d).toISOString() : null);
/** Polling: keyingi `since` — so'rov boshidan 5 s oldin (parallel yozuvlar o'tkazib yuborilmasin; id bo'yicha almashtiring) */
const nextSince = (start: number) => new Date(start - 5_000).toISOString();
const DAY = 24 * 60 * 60 * 1000;
/** KDS to'liq so'rovida (since'siz) bekor qilingan taomlar shuncha vaqt orqaga qaraladi */
const KDS_VOID_LOOKBACK_MS = 2 * 60_000;

/** Admin uchun filiallar (tanlash); filial xodimiga — bo'sh */
async function branchesFor(ctx: RestaurantCtx): Promise<{ id: string; name: string; isMain: boolean }[]> {
  if (ctx.user.role !== 'admin') return [];
  const list = await ctx.m.Branch.find({ active: true }).select('name isMain').sort({ createdAt: 1 }).lean();
  return list.map((b) => ({ id: String(b._id), name: b.name, isMain: !!b.isMain }));
}

const ORDER_READ_PERMS = ['order.create', 'order.viewAll'] as const;

/* ───────────────────────────── stollar taxtasi ───────────────────────────── */

export interface TableBoardRow {
  id: string;
  hallId: string;
  number: number;
  seats: number;
  x: number | null;
  y: number | null;
  /** Mijoz QR chaqiruvlari (ko'rilgach ackTableCall bilan tozalanadi) */
  calls: { waiterAt: string | null; billAt: string | null };
  /** null — bo'sh stol */
  order: OrderSummary | null;
}

export interface TablesBoard {
  serverTime: string;
  branchId: string;
  branches: { id: string; name: string; isMain: boolean }[];
  halls: { id: string; name: string; sort: number }[];
  tables: TableBoardRow[];
  /** Stolsiz ochiq buyurtmalar (saboy) — faqat ko'rish huquqi borlari */
  takeaway: OrderSummary[];
}

export async function tablesBoard(ctx: RestaurantCtx, input: { branchId?: string } = {}): Promise<OpResult<TablesBoard>> {
  const denied = needFeature(ctx, 'tables') ?? needAnyPerm(ctx, ORDER_READ_PERMS);
  if (denied) return denied;
  const br = await resolveBranchId(ctx, input.branchId);
  if (!br.ok) return br;
  const branchId = br.data;
  const start = Date.now();
  const [halls, tables, orders, branches] = await Promise.all([
    ctx.m.Hall.find({ branchId, active: true }).sort({ sort: 1, createdAt: 1 }).select('name sort').lean(),
    ctx.m.Table.find({ branchId, active: true }).sort({ number: 1 }).select('hallId number seats x y callWaiterAt callBillAt').lean(),
    ctx.m.Order.find({ branchId, status: { $in: ['open', 'precheck'] } })
      .select('orderNo type status source tableId tableNumber guests waiterId waiterName openedAt updatedAt serviceChargePct packFee packFeePaid items.price items.qty items.status items.paidCheckoutId payments.total branchId')
      .lean<OrderDoc[]>(),
    branchesFor(ctx),
  ]);
  const summarize = (o: OrderDoc) => orderSummary(o, ctx.user.id, canAccessOrder(ctx.user, ctx.perms, o));
  const byTable = new Map<string, OrderDoc>();
  const takeaway: OrderSummary[] = [];
  for (const o of orders) {
    if (o.tableId) byTable.set(String(o.tableId), o);
    else if (canAccessOrder(ctx.user, ctx.perms, o)) takeaway.push(summarize(o));
  }
  return ok({
    serverTime: new Date(start).toISOString(),
    branchId,
    branches,
    halls: halls.map((h) => ({ id: String(h._id), name: h.name, sort: h.sort ?? 0 })),
    tables: tables.map((t) => {
      const o = byTable.get(String(t._id));
      return {
        id: String(t._id),
        hallId: String(t.hallId),
        number: t.number,
        seats: t.seats,
        x: t.x ?? null,
        y: t.y ?? null,
        calls: { waiterAt: iso(t.callWaiterAt), billAt: iso(t.callBillAt) },
        order: o ? summarize(o) : null,
      };
    }),
    takeaway: takeaway.sort((a, b) => String(a.openedAt).localeCompare(String(b.openedAt))),
  });
}

/* ───────────────────────────── buyurtmalar ───────────────────────────── */

export interface OrdersListInput {
  branchId?: string;
  /** active — ochiq va pre-chek (standart); closed — oxirgi 24 soatda yopilgan; all */
  status?: 'active' | 'closed' | 'all';
  /** Faqat shu vaqtdan keyin o'zgarganlar (holatidan qat'i nazar — UI yopilganlarini ro'yxatdan oladi) */
  since?: Date;
  type?: 'dine_in' | 'takeaway' | 'qr_self';
  limit?: number;
}

export async function listOrders(ctx: RestaurantCtx, input: OrdersListInput = {}): Promise<OpResult<{ serverTime: string; next: string; orders: OrderSummary[] }>> {
  const denied = needFeature(ctx, 'tables') ?? needAnyPerm(ctx, ORDER_READ_PERMS);
  if (denied) return denied;
  const br = await resolveBranchId(ctx, input.branchId);
  if (!br.ok) return br;
  const start = Date.now();
  const filter: Record<string, unknown> = { branchId: br.data };
  if (input.since) filter.updatedAt = { $gte: input.since };
  else if ((input.status ?? 'active') === 'active') filter.status = { $in: ['open', 'precheck'] };
  else if (input.status === 'closed') Object.assign(filter, { status: { $in: ['paid', 'cancelled'] }, updatedAt: { $gte: new Date(start - DAY) } });
  if (input.type) filter.type = input.type;
  if (!ctx.perms.has('order.viewAll')) filter.$or = [{ waiterId: ctx.user.id }, { waiterId: null }];
  const orders = await ctx.m.Order.find(filter)
    .sort({ updatedAt: -1 })
    .limit(Math.min(Math.max(input.limit ?? 100, 1), 200))
    .select('orderNo type status source tableId tableNumber guests waiterId waiterName openedAt updatedAt serviceChargePct packFee packFeePaid items.price items.qty items.status items.paidCheckoutId payments.total branchId')
    .lean<OrderDoc[]>();
  return ok({
    serverTime: new Date(start).toISOString(),
    next: nextSince(start),
    orders: orders.filter((o) => canAccessOrder(ctx.user, ctx.perms, o)).map((o) => orderSummary(o, ctx.user.id, true)),
  });
}

/** To'liq buyurtma (taomlar, to'lovlar, hisob, `can` — UI tugmalari). `serverTime` — mobil/telefon soati farqi uchun */
export async function getOrder(ctx: RestaurantCtx, orderId: string): Promise<OpResult<{ order: OrderView; serverTime: string }>> {
  const denied = needFeature(ctx, 'tables') ?? needAnyPerm(ctx, ORDER_READ_PERMS);
  if (denied) return denied;
  const r = await loadOrder(ctx, orderId);
  if (!r.ok) return r;
  if (!canAccessOrder(ctx.user, ctx.perms, r.data)) return fail(ctx.d, 'orderNotFound');
  return ok({ order: await orderViewFor(ctx, r.data), serverTime: new Date().toISOString() });
}

/* ───────────────────────────── oshxona ekrani (KDS) ───────────────────────────── */

export interface KdsItem {
  id: string;
  name: string;
  displayName: string;
  qty: number;
  unit: string | null;
  modifiers: { group: string; name: string }[];
  note: string | null;
  status: ItemStatus;
  stationId: string | null;
  stationKind: StationKind | null;
  /** Mijoz QR orqali buyurtma qilgan (ofitsant tasdiqlagan) taom */
  fromQr: boolean;
  sentAt: string | null;
  cookStartedAt: string | null;
  readyAt: string | null;
  /** Yuborilganidan beri (ms) */
  elapsedMs: number;
  /** Rang: ok | warn (sariq) | alert (qizil) — sozlamadagi daqiqalar bo'yicha */
  level: 'ok' | 'warn' | 'alert';
}

/** Oshxonaga yuborilgandan keyin bekor qilingan taom (KDS «tayyorlamang!» ogohlantirishi uchun) */
export interface KdsVoided {
  id: string;
  reason: string | null;
  voidedAt: string | null;
}

export interface KdsOrder {
  id: string;
  orderNo: string;
  type: OrderDoc['type'];
  status: OrderDoc['status'];
  /** Kim ochgan: ofitsant / mijoz QR / kassa */
  source: OrderSource;
  tableNumber: number | null;
  waiterName: string | null;
  guests: number | null;
  /** Buyurtma izohi (ofitsant: «allergiya», «tezroq» va h.k.) */
  note: string | null;
  updatedAt: string | null;
  /** Bo'sh bo'lsa (since rejimida) — buyurtmani ekrandan olib tashlang */
  items: KdsItem[];
  /**
   * Shu stansiyada yuborilgandan keyin bekor qilingan taomlar: `since` rejimida — `since` dan keyin
   * bekor qilinganlar, to'liq rejimda — oxirgi 2 daqiqadagilar. Ekrandan yo'qolgan taom «berildi»mi yoki
   * «bekor qilindi»mi — shundan aniqlanadi.
   */
  voided: KdsVoided[];
}

export interface KitchenBoard {
  serverTime: string;
  next: string;
  branchId: string;
  branches: { id: string; name: string; isMain: boolean }[];
  settings: Pick<RestaurantSettings, 'kdsWarnMinutes' | 'kdsAlertMinutes'>;
  stations: { id: string; name: string; kind: StationKind }[];
  orders: KdsOrder[];
}

export async function kitchenBoard(
  ctx: RestaurantCtx,
  input: { branchId?: string; stationId?: string; since?: Date } = {},
): Promise<OpResult<KitchenBoard>> {
  const denied = needFeature(ctx, 'kitchen') ?? needPerm(ctx, 'kitchen.view');
  if (denied) return denied;
  const br = await resolveBranchId(ctx, input.branchId);
  if (!br.ok) return br;
  const branchId = br.data;
  const start = Date.now();
  const now = new Date(start);
  const stationId = input.stationId && /^[a-f0-9]{24}$/i.test(input.stationId) ? input.stationId : undefined;

  // Bekor qilingan taomlar oynasi: since rejimida — since'dan, to'liq rejimda — oxirgi 2 daqiqa
  const voidedFrom = input.since ?? new Date(start - KDS_VOID_LOOKBACK_MS);
  const filter: Record<string, unknown> = input.since
    ? { branchId, updatedAt: { $gte: input.since } }
    : {
        branchId,
        status: { $in: ['open', 'precheck', 'paid', 'cancelled'] },
        $or: [
          { items: { $elemMatch: { status: { $in: KDS_STATUSES }, ...(stationId ? { stationId } : {}) } } },
          { items: { $elemMatch: { status: 'voided', voidedAt: { $gte: voidedFrom }, voidStage: { $ne: 'unsent' }, ...(stationId ? { stationId } : {}) } } },
        ],
        updatedAt: { $gte: new Date(start - DAY) },
      };
  const [settings, stations, orders, branches] = await Promise.all([
    restaurantSettings(ctx.m),
    ctx.m.KitchenStation.find({ branchId, active: true }).sort({ sort: 1, createdAt: 1 }).select('name kind').lean(),
    ctx.m.Order.find(filter).sort({ openedAt: 1 }).limit(300)
      .select('orderNo type status source tableNumber waiterName guests note updatedAt items')
      .lean<OrderDoc[]>(),
    branchesFor(ctx),
  ]);

  const inStation = (i: { stationId?: unknown }) => !stationId || String(i.stationId ?? '') === stationId;
  const out: KdsOrder[] = orders.map((o) => ({
    id: String(o._id),
    orderNo: o.orderNo,
    type: o.type,
    status: o.status,
    source: o.source ?? 'waiter',
    tableNumber: o.tableNumber ?? null,
    waiterName: o.waiterName ?? null,
    guests: o.guests ?? null,
    note: o.note ?? null,
    updatedAt: iso(o.updatedAt),
    voided: o.items
      .filter((i) => i.status === 'voided' && i.voidStage !== 'unsent' && !!i.voidedAt && i.voidedAt >= voidedFrom && inStation(i))
      .map((i) => ({ id: String(i._id), reason: i.voidReason ?? null, voidedAt: iso(i.voidedAt) })),
    items: o.status === 'cancelled' ? [] : o.items
      .filter((i) => KDS_STATUSES.includes(i.status) && inStation(i))
      .map((i) => ({
        id: String(i._id),
        name: i.name,
        displayName: itemDisplayName(i.name, i.modifiers),
        qty: i.qty,
        unit: i.unit ?? null,
        modifiers: (i.modifiers ?? []).map((x) => ({ group: x.group, name: x.name })),
        note: i.note ?? null,
        status: i.status,
        stationId: i.stationId ? String(i.stationId) : null,
        stationKind: i.stationKind ?? null,
        fromQr: !!i.fromQr,
        sentAt: iso(i.sentAt),
        cookStartedAt: iso(i.cookStartedAt),
        readyAt: iso(i.readyAt),
        elapsedMs: i.sentAt ? Math.max(0, start - new Date(i.sentAt).getTime()) : 0,
        level: i.status === 'ready' ? 'ok' : kdsLevel(i.sentAt, now, settings),
      })),
  }));
  // Oddiy rejimda — bo'sh kartochkalar kerak emas (faqat yaqinda bekor qilingani bo'lsa — ogohlantirish uchun);
  // since rejimida bo'sh = «olib tashlang»
  const list = input.since ? out : out.filter((o) => o.items.length || o.voided.length);
  return ok({
    serverTime: now.toISOString(),
    next: nextSince(start),
    branchId,
    branches,
    settings: { kdsWarnMinutes: settings.kdsWarnMinutes, kdsAlertMinutes: settings.kdsAlertMinutes },
    stations: stations.map((s) => ({ id: String(s._id), name: s.name, kind: s.kind })),
    orders: list,
  });
}

/* ───────────────────────────── menyu ───────────────────────────── */

export interface MenuItemView {
  id: string;
  name: string;
  price: number;
  photoUrl: string | null;
  category: string | null;
  categoryId: string | null;
  kind: 'goods' | 'service' | 'bundle';
  unit: string | null;
  stationId: string | null;
  stopListed: boolean;
  /** Sotsa bo'ladigan miqdor; null — cheklovsiz (xizmat) */
  available: number | null;
  /** MXIK (IKPU) — fiskal chek uchun; null — kiritilmagan. Mijoz QR-menyusiga chiqmaydi */
  ikpu: string | null;
  modifierGroups: { id: string; name: string; required: boolean; min: number; max: number; options: { id: string; name: string; price: number }[] }[];
}

type MenuProduct = IProduct & { _id: Types.ObjectId };

/**
 * Menyu: filialdagi sotuvdagi mahsulotlar (taom), kategoriya bo'yicha. `forPublic` — stop-list va tugaganlar
 * yashirin; `withSoldOut` — qoldig'i tugagan (status `sold`) sanaladigan tovar ham (faqat menyu muharriri:
 * stansiya/modifikator/MXIK ni tovar kelishidan oldin sozlash uchun; ofitsant va mijoz menyusida emas).
 */
export async function buildMenu(
  m: Pick<RestaurantModels, 'Product'>,
  branchId: string | Types.ObjectId,
  opts: { forPublic?: boolean; withSoldOut?: boolean } = {},
): Promise<{ categories: string[]; items: MenuItemView[] }> {
  const status = opts.withSoldOut && !opts.forPublic
    ? { $or: [{ status: 'in_stock' }, { status: 'sold', trackQuantity: true }] }
    : { status: 'in_stock' };
  const products = await m.Product.find(
    { branchId, ...status, ...(opts.forPublic ? { stopListed: { $ne: true } } : {}) },
    {
      name: 1, salePrice: 1, photoUrl: 1, category: 1, categoryId: 1, kind: 1, unit: 1, trackQuantity: 1, quantity: 1,
      soldQuantity: 1, status: 1, bundleItems: 1, stationId: 1, modifierGroups: 1, stopListed: 1, systemKey: 1, ikpu: 1,
    },
  ).sort({ category: 1, name: 1 }).limit(1000).lean<MenuProduct[]>();
  const sell = await sellableInfo(m.Product, products);
  const items: MenuItemView[] = [];
  for (const p of products) {
    if (p.systemKey) continue;
    const s = sell(p);
    const available = s.available >= SERVICE_AVAILABLE ? null : s.available;
    if (opts.forPublic && available !== null && available <= 0) continue;
    items.push({
      id: String(p._id),
      name: p.name,
      price: p.salePrice,
      photoUrl: p.photoUrl ? resolvePublicFileUrl(p.photoUrl) : null,
      category: p.category ?? null,
      categoryId: p.categoryId ? String(p.categoryId) : null,
      kind: p.kind ?? 'goods',
      unit: p.unit ?? null,
      stationId: p.stationId ? String(p.stationId) : null,
      stopListed: !!p.stopListed,
      available,
      ikpu: p.ikpu || null,
      modifierGroups: (p.modifierGroups ?? []).map((g) => ({
        id: String(g._id),
        name: g.name,
        required: !!g.required,
        min: g.min ?? 0,
        max: g.max ?? 1,
        options: (g.options ?? []).map((o) => ({ id: String(o._id), name: o.name, price: o.price ?? 0 })),
      })),
    });
  }
  const categories = [...new Set(items.map((i) => i.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
  return { categories, items };
}

/** Xodim menyusi (ofitsant, kassa, oshxona stop-list): stop-listdagilar ham (belgi bilan) */
export async function staffMenu(ctx: RestaurantCtx, input: { branchId?: string } = {}): Promise<OpResult<{ branchId: string; categories: string[]; items: MenuItemView[] }>> {
  const denied = (needFeature(ctx, 'tables') && needFeature(ctx, 'kitchen'))
    ?? needAnyPerm(ctx, ['order.create', 'order.viewAll', 'menu.stopList', 'kitchen.view']);
  if (denied) return denied;
  const br = await resolveBranchId(ctx, input.branchId);
  if (!br.ok) return br;
  return ok({ branchId: br.data, ...(await buildMenu(ctx.m, br.data)) });
}

/* ───────────────────────────── sozlamalar ko'rinishi ───────────────────────────── */

export interface RestaurantSetupView {
  branchId: string;
  branches: { id: string; name: string; isMain: boolean }[];
  settings: RestaurantSettings;
  /** QR-menyu manzili uchun do'kon slug'i (alohida menu slug yo'q) */
  menuSlug: string;
  /** Mutlaq manzil boshi: https://savora.uz/m/<slug>/ */
  qrBaseUrl: string;
  halls: { id: string; name: string; sort: number; active: boolean }[];
  tables: { id: string; hallId: string; number: number; seats: number; x: number | null; y: number | null; active: boolean; qrToken: string; qrPath: string; qrUrl: string; busy: boolean }[];
  stations: { id: string; name: string; kind: StationKind; printerIp: string | null; sort: number; active: boolean }[];
}

export async function restaurantSetupView(ctx: RestaurantCtx, input: { branchId?: string } = {}): Promise<OpResult<RestaurantSetupView>> {
  const denied = needFeature(ctx, 'tables') ?? needPerm(ctx, 'tables.manage');
  if (denied) return denied;
  const br = await resolveBranchId(ctx, input.branchId);
  if (!br.ok) return br;
  const branchId = br.data;
  const [settings, halls, tables, stations, branches, busy] = await Promise.all([
    restaurantSettings(ctx.m),
    ctx.m.Hall.find({ branchId }).sort({ sort: 1, createdAt: 1 }).lean(),
    ctx.m.Table.find({ branchId }).sort({ number: 1 }).lean(),
    ctx.m.KitchenStation.find({ branchId }).sort({ sort: 1, createdAt: 1 }).lean(),
    branchesFor(ctx),
    ctx.m.Order.find({ branchId, status: { $in: ['open', 'precheck'] }, tableId: { $exists: true } }).select('tableId').lean(),
  ]);
  const busyIds = new Set(busy.map((o) => String(o.tableId)));
  const base = siteUrl();
  return ok({
    branchId,
    branches,
    settings,
    menuSlug: ctx.orgSlug,
    qrBaseUrl: `${base}/m/${encodeURIComponent(ctx.orgSlug)}/`,
    halls: halls.map((h) => ({ id: String(h._id), name: h.name, sort: h.sort ?? 0, active: h.active })),
    tables: tables.map((t) => {
      const qrPath = qrMenuPath(ctx.orgSlug, t.qrToken);
      return {
        id: String(t._id), hallId: String(t.hallId), number: t.number, seats: t.seats, x: t.x ?? null, y: t.y ?? null,
        active: t.active, qrToken: t.qrToken, qrPath, qrUrl: `${base}${qrPath}`, busy: busyIds.has(String(t._id)),
      };
    }),
    stations: stations.map((s) => ({ id: String(s._id), name: s.name, kind: s.kind, printerIp: s.printerIp ?? null, sort: s.sort ?? 0, active: s.active })),
  });
}

/** Buyurtmani o'tkazish uchun xodimlar ro'yxati (shu filial loginlari + do'kon egasi) */
export async function waitersList(ctx: RestaurantCtx, input: { branchId?: string } = {}): Promise<OpResult<{ waiters: { id: string; username: string; name: string; role: 'admin' | 'user' }[] }>> {
  const denied = needFeature(ctx, 'tables') ?? needPerm(ctx, 'order.transfer');
  if (denied) return denied;
  const br = await resolveBranchId(ctx, input.branchId);
  if (!br.ok) return br;
  const users = await ctx.m.User.find({ active: true, $or: [{ role: 'admin' }, { branchId: br.data }] })
    .select('username fullName role').sort({ username: 1 }).limit(200).lean();
  return ok({ waiters: users.map((u) => ({ id: String(u._id), username: u.username, name: u.fullName || u.username, role: u.role })) });
}

/* ───────────────────────────── hisobot: vaqtlar ───────────────────────────── */

export interface TimingsReport {
  from: string;
  to: string;
  overall: ReturnType<typeof summarizeTimings>;
  byStation: { stationId: string | null; name: string; stats: ReturnType<typeof summarizeTimings> }[];
  byWaiter: { waiter: string; stats: ReturnType<typeof summarizeTimings> }[];
  byDish: { productId: string; name: string; count: number; stats: ReturnType<typeof summarizeTimings> }[];
  voids: { count: number; amount: number; lossCount: number; lossAmount: number };
}

/** Tayyorlanish (ready − sent) va yetkazish (served − ready) vaqtlari; davr — taom yuborilgan vaqt bo'yicha */
export async function timingsReport(ctx: RestaurantCtx, input: { from: Date; to: Date; branchId?: string }): Promise<OpResult<TimingsReport>> {
  const denied = needFeature(ctx, 'tables') ?? needPerm(ctx, 'reports.view');
  if (denied) return denied;
  const br = await resolveBranchId(ctx, input.branchId);
  if (!br.ok) return br;
  const { from, to } = input;
  if (!(from < to) || to.getTime() - from.getTime() > 93 * DAY) return fail(ctx.d, 'badInput');
  const [orders, stations] = await Promise.all([
    ctx.m.Order.find({ branchId: br.data, openedAt: { $gte: new Date(from.getTime() - DAY), $lt: to } })
      .select('waiterName items').limit(5000).lean<OrderDoc[]>(),
    ctx.m.KitchenStation.find({ branchId: br.data }).select('name').lean(),
  ]);
  const stationName = new Map(stations.map((s) => [String(s._id), s.name]));
  const inRange = (d?: Date | null) => !!d && d >= from && d < to;
  const all: TimedItem[] = [];
  const byStation = new Map<string, TimedItem[]>();
  const byWaiter = new Map<string, TimedItem[]>();
  const byDish = new Map<string, { name: string; items: TimedItem[] }>();
  const voids = { count: 0, amount: 0, lossCount: 0, lossAmount: 0 };
  for (const o of orders) {
    for (const i of o.items) {
      if (i.status === 'voided') {
        if (inRange(i.voidedAt) && i.voidStage !== 'unsent') {
          const amount = Math.round(i.price * i.qty);
          voids.count += 1; voids.amount += amount;
          if (i.voidStage === 'afterCook') { voids.lossCount += 1; voids.lossAmount += amount; }
        }
        continue;
      }
      if (!inRange(i.sentAt) || !i.stationId) continue; // stansiyasiz taomda vaqt o'lchovi yo'q
      all.push(i);
      const sk = String(i.stationId);
      byStation.set(sk, [...(byStation.get(sk) ?? []), i]);
      const wk = o.waiterName ?? '—';
      byWaiter.set(wk, [...(byWaiter.get(wk) ?? []), i]);
      const dk = String(i.productId);
      const cur = byDish.get(dk) ?? { name: i.name, items: [] };
      cur.items.push(i);
      byDish.set(dk, cur);
    }
  }
  return ok({
    from: from.toISOString(),
    to: to.toISOString(),
    overall: summarizeTimings(all),
    byStation: [...byStation.entries()].map(([id, items]) => ({ stationId: id, name: stationName.get(id) ?? '—', stats: summarizeTimings(items) })),
    byWaiter: [...byWaiter.entries()].map(([waiter, items]) => ({ waiter, stats: summarizeTimings(items) })),
    byDish: [...byDish.entries()]
      .map(([productId, v]) => ({ productId, name: v.name, count: v.items.length, stats: summarizeTimings(v.items) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50),
    voids,
  });
}
