/**
 * Restoran buyurtma amallari (server, DB). Web server action'lari, web JSON API va mobil API shu
 * funksiyalarni `RestaurantCtx` bilan chaqiradi; kirish (zod) tekshiruvi chaqiruvchida.
 *
 * Asosiy qoidalar (batafsil — docs/RESTORAN_API.md):
 *  - Ombor OSHXONAGA YUBORISHDA band qilinadi (reserveStock; to'plam/texkarta tarkibi ham). Yetmagan
 *    yoki stop-listdagi taom yuborilmaydi — sababi qaytadi. Stansiyasiz taom yuborilganda darhol «served».
 *  - Bekor qilish: yuborilmagan — oddiy; yuborilgan (tayyorlash boshlanmagan) — ombor qaytadi;
 *    tayyorlash boshlangan — ombor qaytmaydi, yo'qotish sifatida auditga. Yuborilgan taom — `order.voidItem`.
 *  - Pre-chekdan keyin tarkib o'zgarmaydi — faqat `order.reopen` bilan qayta ochib.
 *  - To'lov: har taom alohida naqd `Sale` qatori (umumiy checkoutId, soldBy = ofitsant, orderId, tableNumber);
 *    ombor QAYTA band qilinmaydi. Xizmat haqi va qadoq — filialdagi tizim «xizmat» mahsulotiga qator
 *    (kassa smenasi, naqd kassa, hisobot va chek o'zgarmasdan ishlaydi).
 *  - Parallel yozuvlar: buyurtma `rev` bo'yicha optimistik qulf (mutateOrder), to'qnashuvda qayta urinadi.
 */
import { Types, type Model } from 'mongoose';
import type { IOrder, IOrderItem, IOrderPayment, OrderDoc } from '../models/tenant/Order';
import type { IProduct } from '../models/tenant/Product';
import { branchFilter } from '../branchScope';
import { reserveStock, releaseStock } from '../stock';
import { datePrefix, nextDocNo } from '../counters';
import { generateSaleNo } from '../sales';
import { recordAudit } from '../audit';
import { ensureMainBranchId } from '../mainBranch';
import { getShopSettings } from '../shopSettings';
import { isValidQty, qtyLabel, roundQty } from '../qty';
import { isStockless } from '../productQuantity';
import { allocateParts, settlePayment, type PayPart } from '../payMethods';
import { newCheckoutId, receiptPath } from '../receiptLink';
import { runWithCompensation } from '../compensate';
import { isDupKey } from '../posSync';
import { getDictionary } from '../i18n/dict';
import { tr } from '../i18n/fmt';
import { fmtMoney } from '../format';
import { logError } from '../logger';
import { markOnboardingStep } from '../onboarding';
import { notifyNewSale, salePayLabel } from '../shopNotify';
import type { CartDiscount } from '../posCart';
import { computeBill, computePartTotals, effectiveServicePct, isBillable, type PartTotals } from './bill';
import { itemDisplayName, resolveModifiers } from './modifiers';
import { bumpPermissions, canAccessOrder, canTransition, inBranchScope, orderAllows, voidRule, type BumpTarget, type OrderOp } from './rules';
import { RESERVED_STATUSES, RESTAURANT_LIMITS, type RestaurantSettings, type TableCallKind } from './types';
import { fail, needAnyPerm, needFeature, needPerm, ok, orderRef, type OpErr, type OpResult, type RestaurantCtx, type RestaurantModels } from './context';
import { orderView, type OrderView } from './view';

type Item = IOrderItem;

/* ───────────────────────────── umumiy yordamchilar ───────────────────────────── */

const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

export async function restaurantSettings(m: Pick<RestaurantModels, 'ShopSettings'>): Promise<RestaurantSettings> {
  return (await getShopSettings(m.ShopSettings)).restaurant;
}

/**
 * Amal bajariladigan filial: filial xodimi — o'z filiali (boshqasini so'rasa — xato);
 * admin — so'ralgan filial, bo'lmasa zal ochilgan birinchi filial, u ham bo'lmasa asosiy ombor.
 */
export async function resolveBranchId(ctx: RestaurantCtx, requested?: string | null): Promise<OpResult<string>> {
  if (ctx.user.role !== 'admin') {
    if (!ctx.user.branchId) return fail(ctx.d, 'badBranch');
    if (requested && requested !== ctx.user.branchId) return fail(ctx.d, 'badBranch');
    return ok(ctx.user.branchId);
  }
  if (requested) {
    if (!validId(requested)) return fail(ctx.d, 'badBranch');
    const b = await ctx.m.Branch.findOne({ _id: requested, active: true }).select('_id').lean();
    return b ? ok(requested) : fail(ctx.d, 'badBranch');
  }
  const hall = await ctx.m.Hall.findOne({ active: true }).sort({ createdAt: 1 }).select('branchId').lean();
  if (hall) return ok(String(hall.branchId));
  return ok(await ensureMainBranchId(ctx.m.Branch));
}

/**
 * Ko'rinish qo'shimchalari (zal nomi — pre-chek uchun, `requireVoidReason` — bekor qilish oynasi uchun).
 * Bitta so'rov (ctx) davomida keshlanadi: bir amalda bir necha marta ko'rinish qurilsa ham DB bir marta o'qiladi.
 */
const extrasCache = new WeakMap<RestaurantCtx, { settings?: Promise<RestaurantSettings>; halls: Map<string, Promise<string | null>> }>();

async function viewExtras(ctx: RestaurantCtx, o: OrderDoc): Promise<{ hallName: string | null; requireVoidReason: boolean }> {
  let c = extrasCache.get(ctx);
  if (!c) { c = { halls: new Map() }; extrasCache.set(ctx, c); }
  c.settings ??= restaurantSettings(ctx.m);
  const hallKey = o.hallId ? String(o.hallId) : '';
  let hall = hallKey ? c.halls.get(hallKey) : Promise.resolve(null);
  if (!hall) {
    hall = ctx.m.Hall.findById(hallKey).select('name').lean().then((h) => h?.name ?? null);
    c.halls.set(hallKey, hall);
  }
  const [settings, hallName] = await Promise.all([c.settings, hall]);
  return { hallName, requireVoidReason: settings.requireVoidReason };
}

/** To'liq ko'rinish (OrderView) joriy foydalanuvchi uchun: `can`, zal nomi, sozlama bilan */
export async function orderViewFor(ctx: RestaurantCtx, o: OrderDoc): Promise<OrderView> {
  return orderView(o, { orgId: ctx.orgId, actor: ctx.user, perms: ctx.perms, ...(await viewExtras(ctx, o)) });
}

const view = orderViewFor;

function access(ctx: RestaurantCtx, o: OrderDoc): OpErr | null {
  return canAccessOrder(ctx.user, ctx.perms, o) ? null : fail(ctx.d, 'orderNotFound');
}

/** Holat bu amalga ruxsat bermasa — sababli xato */
function statusGuard(ctx: RestaurantCtx, o: Pick<IOrder, 'status'>, op: OrderOp): OpErr | null {
  if (orderAllows(o.status, op)) return null;
  if (o.status === 'precheck') return fail(ctx.d, 'orderLocked');
  if (o.status === 'open' && op === 'reopen') return fail(ctx.d, 'notPrecheck');
  return fail(ctx.d, 'orderClosed');
}

export async function loadOrder(ctx: RestaurantCtx, orderId: string): Promise<OpResult<OrderDoc>> {
  if (!validId(orderId)) return fail(ctx.d, 'orderNotFound');
  const o = await ctx.m.Order.findOne({ _id: orderId, ...branchFilter(ctx.user) }).lean<OrderDoc>();
  return o ? ok(o) : fail(ctx.d, 'orderNotFound');
}

interface Plan<T> {
  /** Yoziladigan maydonlar; bo'sh bo'lsa — yozuvsiz (o'zgarish yo'q) */
  set: Record<string, unknown>;
  unset?: string[];
  /** Yozuv rev to'qnashuvi yoki xato bilan tushsa — oldin bajarilgan yon ta'sirni qaytarish (ombor) */
  undo?: () => Promise<void>;
  /** Yozuvdan keyin (ombor qaytarish, audit) */
  after?: (saved: OrderDoc) => Promise<void>;
  /** Noyob indeks to'qnashuvi (stol band) bo'lsa qaytariladigan xato */
  onDuplicate?: OpErr;
  result: (saved: OrderDoc) => T | Promise<T>;
}

/**
 * Optimistik qulf: buyurtmani o'qiydi → reja tuzadi → `rev` o'zgarmagan bo'lsagina yozadi.
 * To'qnashuvda yon ta'sir qaytariladi va 3 martagacha qayta uriniladi.
 */
async function mutateOrder<T>(
  ctx: RestaurantCtx,
  orderId: string,
  build: (o: OrderDoc) => Promise<OpResult<Plan<T>>> | OpResult<Plan<T>>,
): Promise<OpResult<T>> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const loaded = await loadOrder(ctx, orderId);
    if (!loaded.ok) return loaded;
    const order = loaded.data;
    const planned = await build(order);
    if (!planned.ok) return planned;
    const plan = planned.data;
    if (!Object.keys(plan.set).length && !plan.unset?.length) return ok(await plan.result(order));

    let saved: OrderDoc | null;
    try {
      saved = await ctx.m.Order.findOneAndUpdate(
        { _id: order._id, rev: order.rev ?? 0 },
        {
          $set: plan.set,
          ...(plan.unset?.length ? { $unset: Object.fromEntries(plan.unset.map((k) => [k, ''])) } : {}),
          $inc: { rev: 1 },
        },
        { new: true },
      ).lean<OrderDoc>();
    } catch (e) {
      if (plan.undo) await plan.undo().catch((err) => logError('restaurant undo failed', err));
      if (isDupKey(e) && plan.onDuplicate) return plan.onDuplicate;
      throw e;
    }
    if (saved) {
      if (plan.after) await plan.after(saved).catch((err) => logError('restaurant after-write failed', err));
      return ok(await plan.result(saved));
    }
    if (plan.undo) await plan.undo().catch((err) => logError('restaurant undo failed', err));
  }
  return fail(ctx.d, 'conflict');
}

function audit(ctx: RestaurantCtx, action: string, o: Pick<IOrder, 'orderNo' | 'tableNumber'> & { _id: unknown }, summary: string, meta?: Record<string, unknown>) {
  return recordAudit(ctx.user, {
    action,
    entity: 'order',
    entityId: String(o._id),
    summary: `${orderRef(o)}: ${summary}${ctx.via ?? ''}`,
    meta,
  });
}

/* ───────────────────────────── taom tayyorlash ───────────────────────────── */

export interface AddItemInput {
  /** Mobil/oflayn idempotentlik kaliti (buyurtma ichida noyob) */
  clientItemId?: string;
  productId: string;
  qty: number;
  /** Tanlangan modifikator variantlari (Product.modifierGroups[].options[]._id) */
  optionIds?: string[];
  note?: string;
}

type ProductLean = IProduct & { _id: Types.ObjectId };

/**
 * Kiritilgan taomlarni buyurtma qatoriga aylantiradi: mahsulot shu filialda va sotuvda, stop-listda emas,
 * miqdor birlikka mos, modifikatorlar to'g'ri. Narx serverda hisoblanadi (client faqat tanlov yuboradi).
 */
export async function prepareItems(
  m: Pick<RestaurantModels, 'Product' | 'KitchenStation'>,
  d: RestaurantCtx['d'],
  branchId: Types.ObjectId | string,
  inputs: readonly AddItemInput[],
  opts: { addedBy: string; status: 'new' | 'pending'; fromQr?: boolean; now?: Date },
): Promise<OpResult<Item[]>> {
  const ids = [...new Set(inputs.map((x) => x.productId))];
  if (!ids.every(validId)) return fail(d, 'productNotFound');
  const products = await m.Product.find(
    { _id: { $in: ids }, branchId, status: 'in_stock' },
    { name: 1, salePrice: 1, kind: 1, trackQuantity: 1, unit: 1, stationId: 1, modifierGroups: 1, stopListed: 1, systemKey: 1 },
  ).lean<ProductLean[]>();
  const byId = new Map(products.filter((p) => !p.systemKey).map((p) => [String(p._id), p]));
  const stationIds = [...new Set(products.map((p) => p.stationId).filter(Boolean).map(String))];
  const stations = stationIds.length
    ? await m.KitchenStation.find({ _id: { $in: stationIds }, branchId, active: true }, { kind: 1 }).lean()
    : [];
  const stationById = new Map(stations.map((s) => [String(s._id), s]));
  const now = opts.now ?? new Date();

  const out: Item[] = [];
  for (const input of inputs) {
    const p = byId.get(input.productId);
    if (!p) return fail(d, 'productNotFound');
    if (p.stopListed) return fail(d, 'stopListed', { name: p.name });
    const unit = p.kind === 'bundle' ? 'dona' : p.unit;
    const counted = p.trackQuantity || isStockless(p);
    // Son yuritilmaydigan yagona tovar (IMEI kabi) — faqat 1 dona
    if (!counted && input.qty !== 1) return fail(d, 'badQty', { name: p.name });
    if (!isValidQty(input.qty, unit) || input.qty > RESTAURANT_LIMITS.maxItemQty) return fail(d, 'badQty', { name: p.name });
    const mods = resolveModifiers(p.modifierGroups, input.optionIds ?? []);
    if (!mods.ok) return fail(d, 'badModifiers', { name: p.name, group: mods.group ?? '—' });
    const station = p.stationId ? stationById.get(String(p.stationId)) : undefined;
    out.push({
      _id: new Types.ObjectId(),
      ...(input.clientItemId ? { clientItemId: input.clientItemId } : {}),
      productId: p._id,
      name: p.name,
      basePrice: p.salePrice,
      price: p.salePrice + mods.extra,
      qty: roundQty(input.qty),
      ...(p.unit ? { unit: p.unit } : {}),
      modifiers: mods.modifiers,
      ...(input.note ? { note: input.note } : {}),
      ...(station ? { stationId: p.stationId, stationKind: station.kind } : {}),
      status: opts.status,
      stockReserved: false,
      addedBy: opts.addedBy,
      addedAt: now,
      ...(opts.fromQr ? { fromQr: true } : {}),
    } as Item);
  }
  return ok(out);
}

/* ───────────────────────────── stol ochish / buyurtma ───────────────────────────── */

export interface OpenOrderInput {
  type: 'dine_in' | 'takeaway';
  tableId?: string;
  /** Admin uchun: saboy qaysi filialda (filial xodimida — o'z filiali) */
  branchId?: string;
  guests?: number;
  note?: string;
  /** Takroriy yuborishdan himoya (mobil) */
  clientOrderId?: string;
  /** Darhol qo'shiladigan taomlar (ixtiyoriy) */
  items?: AddItemInput[];
}

/** Stol ochish (dine_in) yoki saboy buyurtma. Stolda ochiq buyurtma bo'lsa — o'shani qaytaradi (`existing: true`) */
export async function openOrder(ctx: RestaurantCtx, input: OpenOrderInput): Promise<OpResult<{ order: OrderView; existing: boolean }>> {
  const off = needFeature(ctx, 'tables');
  if (off) return off;
  const denied = needPerm(ctx, 'order.create');
  if (denied) return denied;
  const { Order, Table } = ctx.m;

  const existingVisible = async (filter: Record<string, unknown>, busyNo?: number) => {
    const o = await Order.findOne({ ...filter, ...branchFilter(ctx.user) }).lean<OrderDoc>();
    if (!o) return null;
    if (canAccessOrder(ctx.user, ctx.perms, o)) return ok({ order: await view(ctx, o), existing: true });
    return fail(ctx.d, 'tableBusy', { n: busyNo ?? o.tableNumber ?? 0 });
  };

  if (input.clientOrderId) {
    const prev = await existingVisible({ clientOrderId: input.clientOrderId });
    if (prev) return prev;
  }

  let branchId: string;
  let table: { _id: Types.ObjectId; number: number; hallId: Types.ObjectId; branchId: Types.ObjectId } | null = null;
  if (input.type === 'dine_in') {
    if (!validId(input.tableId)) return fail(ctx.d, 'tableNotFound');
    table = await Table.findOne({ _id: input.tableId, active: true, ...branchFilter(ctx.user) }, { number: 1, hallId: 1, branchId: 1 }).lean();
    if (!table) return fail(ctx.d, 'tableNotFound');
    branchId = String(table.branchId);
    const busy = await existingVisible({ activeTableKey: String(table._id), status: { $in: ['open', 'precheck'] } }, table.number);
    if (busy) return busy;
  } else {
    const br = await resolveBranchId(ctx, input.branchId);
    if (!br.ok) return br;
    branchId = br.data;
  }

  const settings = await restaurantSettings(ctx.m);
  const now = new Date();
  let items: Item[] = [];
  if (input.items?.length) {
    if (input.items.length > RESTAURANT_LIMITS.maxAddItems) return fail(ctx.d, 'tooManyItems');
    const prepared = await prepareItems(ctx.m, ctx.d, branchId, input.items, { addedBy: ctx.user.username, status: 'new', now });
    if (!prepared.ok) return prepared;
    items = prepared.data;
  }

  const orderNo = await nextDocNo(Order, 'orderNo', 'order', datePrefix('B'));
  try {
    const created = await Order.create({
      orderNo,
      branchId,
      type: input.type,
      source: input.type === 'takeaway' ? 'cashier' : 'waiter',
      status: 'open',
      ...(table ? { tableId: table._id, tableNumber: table.number, hallId: table.hallId, activeTableKey: String(table._id) } : {}),
      ...(input.guests ? { guests: input.guests } : {}),
      waiterId: ctx.user.id,
      waiterName: ctx.user.username,
      serviceChargePct: effectiveServicePct(input.type, settings.serviceChargePct),
      packFee: input.type === 'takeaway' ? settings.takeawayPackFee : 0,
      items,
      payments: [],
      ...(input.note ? { note: input.note } : {}),
      ...(input.clientOrderId ? { clientOrderId: input.clientOrderId } : {}),
      openedBy: ctx.user.username,
      openedAt: now,
      rev: 0,
    });
    const o = created.toObject() as OrderDoc;
    await audit(ctx, 'order.open', o, `${input.type === 'takeaway' ? 'saboy' : 'stol ochildi'}${items.length ? `, ${items.length} ta taom` : ''}`, { type: input.type });
    return ok({ order: await view(ctx, o), existing: false });
  } catch (e) {
    if (!isDupKey(e)) throw e;
    // Parallel ochilgan: stol band yoki shu clientOrderId bilan allaqachon yaratilgan
    const again = table
      ? await existingVisible({ activeTableKey: String(table._id) }, table.number)
      : input.clientOrderId ? await existingVisible({ clientOrderId: input.clientOrderId }) : null;
    return again ?? fail(ctx.d, 'conflict');
  }
}

/** Taom qo'shish. `clientItemId` bo'yicha idempotent: allaqachon qo'shilgani qayta qo'shilmaydi (`duplicates`) */
export async function addItems(
  ctx: RestaurantCtx,
  orderId: string,
  inputs: AddItemInput[],
): Promise<OpResult<{ order: OrderView; added: string[]; duplicates: string[] }>> {
  const denied = needPerm(ctx, 'order.create');
  if (denied) return denied;
  if (!inputs.length) return fail(ctx.d, 'badInput');
  if (inputs.length > RESTAURANT_LIMITS.maxAddItems) return fail(ctx.d, 'tooManyItems');

  return mutateOrder(ctx, orderId, async (o) => {
    const err = access(ctx, o) ?? statusGuard(ctx, o, 'addItems');
    if (err) return err;
    const known = new Set(o.items.map((i) => i.clientItemId).filter(Boolean) as string[]);
    const duplicates: string[] = [];
    const fresh: AddItemInput[] = [];
    for (const x of inputs) {
      if (x.clientItemId && known.has(x.clientItemId)) { duplicates.push(x.clientItemId); continue; }
      if (x.clientItemId) known.add(x.clientItemId);
      fresh.push(x);
    }
    if (o.items.length + fresh.length > RESTAURANT_LIMITS.maxOrderItems) return fail(ctx.d, 'tooManyItems');
    const prepared = fresh.length
      ? await prepareItems(ctx.m, ctx.d, o.branchId, fresh, { addedBy: ctx.user.username, status: 'new' })
      : ok([] as Item[]);
    if (!prepared.ok) return prepared;
    const added = prepared.data;
    return ok({
      set: added.length ? { items: [...o.items, ...added] } : {},
      result: async (saved: OrderDoc) => ({ order: await view(ctx, saved), added: added.map((i) => String(i._id)), duplicates }),
    });
  });
}

/* ───────────────────────────── oshxonaga yuborish ───────────────────────────── */

export type SendFailReason = 'productNotFound' | 'stopListed' | 'outOfStock';
export interface SendFailure { itemId: string; name: string; reason: SendFailReason; message: string }

/**
 * Tanlangan `new` taomlar uchun ombor band qilinadi (to'plam — tarkibi bilan, hammasi yoki hech biri).
 * Muvaffaqiyatlilar `sent` (stansiyasiz — darhol `served`), qolganlari sababi bilan qaytadi.
 */
async function reserveForItems(ctx: RestaurantCtx, o: OrderDoc, targets: Item[], now: Date) {
  const { Product, KitchenStation } = ctx.m;
  const ids = [...new Set(targets.map((i) => String(i.productId)))];
  const products = await Product.find({ _id: { $in: ids }, branchId: o.branchId }, { name: 1, stopListed: 1, stationId: 1 }).lean<ProductLean[]>();
  const pById = new Map(products.map((p) => [String(p._id), p]));
  const stationIds = [...new Set(products.map((p) => p.stationId).filter(Boolean).map(String))];
  const stations = stationIds.length
    ? await KitchenStation.find({ _id: { $in: stationIds }, branchId: o.branchId, active: true }, { kind: 1 }).lean()
    : [];
  const sById = new Map(stations.map((s) => [String(s._id), s]));

  const updated = new Map<string, Item>();
  const failed: SendFailure[] = [];
  const reserved: { productId: Types.ObjectId; qty: number }[] = [];
  const failOf = (i: Item, reason: SendFailReason) =>
    failed.push({ itemId: String(i._id), name: i.name, reason, message: tr(ctx.d.restaurant.errors[reason], { name: i.name }) });

  for (const item of targets) {
    const p = pById.get(String(item.productId));
    if (!p) { failOf(item, 'productNotFound'); continue; }
    if (p.stopListed) { failOf(item, 'stopListed'); continue; }
    const got = await reserveStock(Product, item.productId, item.qty, {
      scope: { branchId: o.branchId },
      history: { action: 'sold', detail: `Buyurtma ${orderRef(o)}: ${qtyLabel(item.qty, item.unit)}`, by: ctx.user.username, at: now },
    });
    if (!got) { failOf(item, 'outOfStock'); continue; }
    reserved.push({ productId: item.productId, qty: item.qty });
    const station = p.stationId ? sById.get(String(p.stationId)) : undefined;
    const next: Item = {
      ...item,
      status: station ? 'sent' : 'served',
      stockReserved: true,
      sentAt: now,
      sentBy: ctx.user.username,
    };
    delete next.stationId;
    delete next.stationKind;
    if (station) {
      next.stationId = p.stationId;
      next.stationKind = station.kind;
    } else {
      // Stansiyasiz (shisha suv, non) — oshxona ekraniga chiqmaydi, darhol berilgan hisoblanadi
      next.readyAt = now;
      next.servedAt = now;
      next.servedBy = ctx.user.username;
    }
    updated.set(String(item._id), next);
  }

  const undo = async () => {
    for (const r of reserved) {
      await releaseStock(Product, r.productId, r.qty, { action: 'returned', detail: `Buyurtma ${o.orderNo}: yuborish takrorlandi`, by: ctx.user.username, at: new Date() });
    }
  };
  return { updated, failed, undo };
}

/** Oshxonaga yuborish: `itemIds` berilmasa — barcha `new` taomlar */
export async function sendItems(
  ctx: RestaurantCtx,
  orderId: string,
  itemIds?: string[],
): Promise<OpResult<{ order: OrderView; sent: string[]; failed: SendFailure[] }>> {
  const denied = needPerm(ctx, 'order.create');
  if (denied) return denied;
  const want = itemIds?.length ? new Set(itemIds) : null;

  return mutateOrder(ctx, orderId, async (o) => {
    const err = access(ctx, o) ?? statusGuard(ctx, o, 'send');
    if (err) return err;
    const targets = o.items.filter((i) => i.status === 'new' && (!want || want.has(String(i._id))));
    if (!targets.length) return fail(ctx.d, 'nothingToSend');
    const now = new Date();
    const { updated, failed, undo } = await reserveForItems(ctx, o, targets, now);
    if (!updated.size) {
      return fail(ctx.d, 'sendFailed', { names: failed.map((f) => f.name).join(', ') }, { failed });
    }
    return ok({
      set: { items: o.items.map((i) => updated.get(String(i._id)) ?? i) },
      undo,
      after: async (saved: OrderDoc) => {
        await audit(ctx, 'order.send', saved, `oshxonaga ${updated.size} ta taom${failed.length ? `, yuborilmadi: ${failed.map((f) => f.name).join(', ')}` : ''}`, {
          sent: [...updated.keys()], failed,
        });
      },
      result: async (saved: OrderDoc) => ({ order: await view(ctx, saved), sent: [...updated.keys()], failed }),
    });
  });
}

/* ───────────────────────────── mijoz QR taomlari ───────────────────────────── */

export interface ConfirmResult { order: OrderView; confirmed: string[]; rejected: string[]; sent?: string[]; failed?: SendFailure[] }

/** Mijoz QR orqali qo'shgan (pending) taomlarni tasdiqlash yoki rad etish; `send` — tasdiqlangach darhol yuborish */
export async function confirmPendingItems(
  ctx: RestaurantCtx,
  orderId: string,
  input: { itemIds?: string[]; reject?: boolean; send?: boolean },
): Promise<OpResult<ConfirmResult>> {
  const denied = needPerm(ctx, 'order.create');
  if (denied) return denied;
  const want = input.itemIds?.length ? new Set(input.itemIds) : null;

  const res = await mutateOrder(ctx, orderId, (o) => {
    const err = access(ctx, o) ?? statusGuard(ctx, o, 'confirm');
    if (err) return err;
    const targets = new Set(o.items.filter((i) => i.status === 'pending' && (!want || want.has(String(i._id)))).map((i) => String(i._id)));
    if (!targets.size) return fail(ctx.d, 'itemNotFound');
    const now = new Date();
    const items = o.items.map((i): Item => {
      if (!targets.has(String(i._id))) return i;
      return input.reject
        ? { ...i, status: 'voided', voidStage: 'unsent', voidedAt: now, voidedBy: ctx.user.username, voidReason: 'QR: rad etildi' }
        : { ...i, status: 'new', confirmedBy: ctx.user.username };
    });
    // Ofitsanti yo'q (mijoz QR orqali ochgan) buyurtmani tasdiqlagan ofitsant oladi
    const takeOver = !input.reject && !o.waiterId ? { waiterId: ctx.user.id, waiterName: ctx.user.username } : {};
    const ids = [...targets];
    return ok({
      set: { items, ...takeOver },
      after: async (saved: OrderDoc) => {
        await audit(ctx, input.reject ? 'order.qrReject' : 'order.qrConfirm', saved, `${input.reject ? 'rad etildi' : 'tasdiqlandi'}: ${ids.length} ta QR taom`);
      },
      result: async (saved: OrderDoc) => ({
        order: await view(ctx, saved),
        confirmed: input.reject ? [] : ids,
        rejected: input.reject ? ids : [],
      }),
    });
  });
  if (!res.ok || input.reject || !input.send) return res;
  const sent = await sendItems(ctx, orderId, res.data.confirmed);
  if (!sent.ok) return sent.code === 'sendFailed' ? ok({ ...res.data, sent: [], failed: (sent.details?.failed as SendFailure[]) ?? [] }) : sent;
  return ok({ ...res.data, order: sent.data.order, sent: sent.data.sent, failed: sent.data.failed });
}

/* ───────────────────────────── bekor qilish ───────────────────────────── */

/**
 * Taomni bekor qilish (to'liq yoki `qty` qismi). Yuborilgan taom — `order.voidItem` huquqi va
 * (sozlamada yoqilgan bo'lsa) sabab majburiy; tayyorlash boshlanmagan bo'lsa ombor qaytariladi,
 * boshlangan bo'lsa — qaytmaydi va auditda «yo'qotish» bo'lib yoziladi.
 */
export async function voidItem(
  ctx: RestaurantCtx,
  orderId: string,
  input: { itemId: string; qty?: number; reason?: string },
): Promise<OpResult<{ order: OrderView; voidedItemId: string; stockReleased: boolean; loss: boolean }>> {
  const settings = await restaurantSettings(ctx.m);
  return mutateOrder(ctx, orderId, (o) => {
    const err = access(ctx, o) ?? statusGuard(ctx, o, 'void');
    if (err) return err;
    const item = o.items.find((i) => String(i._id) === input.itemId);
    if (!item) return fail(ctx.d, 'itemNotFound');
    const rule = voidRule(item, settings);
    if (!rule) return fail(ctx.d, item.paidCheckoutId ? 'itemPaid' : 'badTransition');
    const denied = needPerm(ctx, rule.permission);
    if (denied) return denied;
    const reason = input.reason?.trim() ?? '';
    if (rule.reasonRequired && !reason) return fail(ctx.d, 'voidReasonRequired');
    const vqty = input.qty !== undefined ? roundQty(input.qty) : item.qty;
    if (!(vqty > 0) || vqty > item.qty || !isValidQty(vqty, item.unit)) return fail(ctx.d, 'badQty', { name: item.name });

    const now = new Date();
    const partial = vqty < item.qty;
    const voided: Item = {
      ...item,
      ...(partial ? { _id: new Types.ObjectId() } : {}),
      qty: vqty,
      status: 'voided',
      voidStage: rule.stage,
      voidedAt: now,
      voidedBy: ctx.user.username,
      ...(reason ? { voidReason: reason } : {}),
      stockReserved: rule.releaseStock ? false : item.stockReserved,
    };
    if (partial) delete voided.clientItemId;
    const items = partial
      ? [...o.items.map((i) => (i === item ? { ...i, qty: roundQty(item.qty - vqty) } : i)), voided]
      : o.items.map((i) => (i === item ? voided : i));
    const releaseNow = rule.releaseStock && item.stockReserved;
    const amount = Math.round(item.price * vqty);
    return ok({
      set: { items },
      after: async (saved: OrderDoc) => {
        if (releaseNow) {
          await releaseStock(ctx.m.Product, item.productId, vqty, { action: 'returned', detail: `Buyurtma ${orderRef(saved)}: taom bekor qilindi`, by: ctx.user.username, at: now });
        }
        await audit(
          ctx,
          rule.loss ? 'order.voidItem.loss' : 'order.voidItem',
          saved,
          `bekor: ${itemDisplayName(item.name, item.modifiers)} × ${vqty} (${fmtMoney(amount)} so'm)${rule.loss ? ' — tayyorlangan, ombor qaytmadi' : releaseNow ? ' — omborga qaytdi' : ''}${reason ? ` · sabab: ${reason}` : ''}`,
          { itemId: String(item._id), stage: rule.stage, qty: vqty, amount, reason, loss: rule.loss, stockReleased: releaseNow },
        );
      },
      result: async (saved: OrderDoc) => ({ order: await view(ctx, saved), voidedItemId: String(voided._id), stockReleased: releaseNow, loss: rule.loss }),
    });
  });
}

/* ───────────────────────────── oshxona holatlari ───────────────────────────── */

export interface BumpSkip { itemId: string; reason: 'itemNotFound' | 'badTransition' }

/** KDS: «Boshlandi» (cooking), «Tayyor» (ready), «Qaytarish» (ready → cooking); ofitsant: «Yetkazildi» (served) */
export async function bumpItems(
  ctx: RestaurantCtx,
  orderId: string,
  input: { itemIds: string[]; to: BumpTarget },
): Promise<OpResult<{ order: OrderView; updated: string[]; skipped: BumpSkip[] }>> {
  const denied = needAnyPerm(ctx, bumpPermissions(input.to));
  if (denied) return denied;
  const viaKitchen = ctx.perms.has('kitchen.bump');

  return mutateOrder(ctx, orderId, (o) => {
    // Oshxona xodimi filialdagi istalgan buyurtmani belgilaydi; ofitsant — faqat o'zinikini
    const scopeErr = viaKitchen ? (inBranchScope(ctx.user, o.branchId) ? null : fail(ctx.d, 'orderNotFound')) : access(ctx, o);
    const err = scopeErr ?? statusGuard(ctx, o, 'bump');
    if (err) return err;
    const now = new Date();
    const want = new Set(input.itemIds);
    const skipped: BumpSkip[] = [];
    const updated: string[] = [];
    const found = new Set<string>();
    const items = o.items.map((i): Item => {
      const id = String(i._id);
      if (!want.has(id)) return i;
      found.add(id);
      if (!canTransition(i.status, input.to)) { skipped.push({ itemId: id, reason: 'badTransition' }); return i; }
      updated.push(id);
      if (input.to === 'cooking') {
        // «Qaytarish» (ready → cooking) — tayyor belgisi o'chadi
        const next: Item = { ...i, status: 'cooking', cookStartedAt: i.cookStartedAt ?? now };
        delete next.readyAt;
        return next;
      }
      if (input.to === 'ready') return { ...i, status: 'ready', readyAt: now };
      return { ...i, status: 'served', servedAt: now, servedBy: ctx.user.username };
    });
    for (const id of want) if (!found.has(id)) skipped.push({ itemId: id, reason: 'itemNotFound' });
    if (!updated.length) return fail(ctx.d, 'badTransition', undefined, { skipped });
    return ok({ set: { items }, result: async (saved: OrderDoc) => ({ order: await view(ctx, saved), updated, skipped }) });
  });
}

/* ───────────────────────────── o'tkazish ───────────────────────────── */

/** Buyurtmani boshqa stolga va/yoki boshqa ofitsantga o'tkazish (`order.transfer`) */
export async function transferOrder(
  ctx: RestaurantCtx,
  orderId: string,
  input: { tableId?: string; waiterId?: string },
): Promise<OpResult<{ order: OrderView }>> {
  const denied = needPerm(ctx, 'order.transfer');
  if (denied) return denied;
  if (!input.tableId && !input.waiterId) return fail(ctx.d, 'badInput');

  return mutateOrder(ctx, orderId, async (o) => {
    const err = access(ctx, o) ?? statusGuard(ctx, o, 'transfer');
    if (err) return err;
    const set: Record<string, unknown> = {};
    const notes: string[] = [];
    let onDuplicate: OpErr | undefined;
    if (input.tableId && input.tableId !== String(o.tableId ?? '')) {
      if (o.type === 'takeaway') return fail(ctx.d, 'badInput');
      if (!validId(input.tableId)) return fail(ctx.d, 'tableNotFound');
      const t = await ctx.m.Table.findOne({ _id: input.tableId, branchId: o.branchId, active: true }, { number: 1, hallId: 1 }).lean();
      if (!t) return fail(ctx.d, 'tableNotFound');
      Object.assign(set, { tableId: t._id, tableNumber: t.number, hallId: t.hallId, activeTableKey: String(t._id) });
      onDuplicate = fail(ctx.d, 'tableBusy', { n: t.number });
      notes.push(`stol ${o.tableNumber ?? '—'} → ${t.number}`);
    }
    if (input.waiterId && input.waiterId !== o.waiterId) {
      if (!validId(input.waiterId)) return fail(ctx.d, 'waiterNotFound');
      const u = await ctx.m.User.findOne({ _id: input.waiterId, active: true }, { username: 1, role: 1, branchId: 1 }).lean();
      if (!u || (u.role === 'user' && String(u.branchId) !== String(o.branchId))) return fail(ctx.d, 'waiterNotFound');
      Object.assign(set, { waiterId: String(u._id), waiterName: u.username });
      notes.push(`ofitsant ${o.waiterName ?? '—'} → ${u.username}`);
    }
    return ok({
      set,
      onDuplicate,
      after: async (saved: OrderDoc) => { if (notes.length) await audit(ctx, 'order.transfer', saved, notes.join(', ')); },
      result: async (saved: OrderDoc) => ({ order: await view(ctx, saved) }),
    });
  });
}

/* ───────────────────────────── pre-chek / qayta ochish / bekor ───────────────────────────── */

/** Yuborilmagan (`new`) taomlarni avtomatik yuboradi; birortasi yuborilmasa — `sendFailed` */
async function sendAllNew(ctx: RestaurantCtx, orderId: string, only?: string[]): Promise<OpErr | null> {
  const r = await sendItems(ctx, orderId, only);
  if (r.ok) {
    if (!r.data.failed.length) return null;
    return fail(ctx.d, 'sendFailed', { names: r.data.failed.map((f) => f.name).join(', ') }, { failed: r.data.failed });
  }
  return r.code === 'nothingToSend' ? null : r;
}

/**
 * Pre-chek («Hisob»): yuborilmagan taomlar avval oshxonaga yuboriladi (ombor band qilinadi), keyin
 * buyurtma `precheck` holatiga o'tadi — tarkib qulflanadi. Mijoz QR taomlari tasdiqlanmagan bo'lsa — rad.
 */
export async function precheckOrder(ctx: RestaurantCtx, orderId: string): Promise<OpResult<{ order: OrderView }>> {
  const denied = needPerm(ctx, 'order.create');
  if (denied) return denied;
  const pre = await loadOrder(ctx, orderId);
  if (!pre.ok) return pre;
  const err = access(ctx, pre.data);
  if (err) return err;
  if (pre.data.status === 'precheck') return ok({ order: await view(ctx, pre.data) });
  if (pre.data.items.some((i) => i.status === 'pending')) return fail(ctx.d, 'pendingItems');
  if (pre.data.items.some((i) => i.status === 'new')) {
    const sendErr = await sendAllNew(ctx, orderId);
    if (sendErr) return sendErr;
  }
  return mutateOrder(ctx, orderId, (o) => {
    if (o.status === 'precheck') return ok({ set: {}, result: async (s: OrderDoc) => ({ order: await view(ctx, s) }) });
    const e = access(ctx, o) ?? statusGuard(ctx, o, 'precheck');
    if (e) return e;
    if (o.items.some((i) => i.status === 'pending')) return fail(ctx.d, 'pendingItems');
    if (o.items.some((i) => i.status === 'new')) return fail(ctx.d, 'conflict');
    if (!o.items.some(isBillable)) return fail(ctx.d, 'emptyOrder');
    const now = new Date();
    return ok({
      set: { status: 'precheck', precheckAt: now, precheckBy: ctx.user.username },
      after: async (saved: OrderDoc) => { await audit(ctx, 'order.precheck', saved, `pre-chek: ${fmtMoney(computeBill(saved).due)} so'm`); },
      result: async (saved: OrderDoc) => ({ order: await view(ctx, saved) }),
    });
  });
}

/** Pre-chekdan keyin o'zgartirish uchun qayta ochish (`order.reopen`) — auditga yoziladi */
export async function reopenOrder(ctx: RestaurantCtx, orderId: string): Promise<OpResult<{ order: OrderView }>> {
  const denied = needPerm(ctx, 'order.reopen');
  if (denied) return denied;
  return mutateOrder(ctx, orderId, (o) => {
    const err = access(ctx, o) ?? statusGuard(ctx, o, 'reopen');
    if (err) return err;
    return ok({
      set: { status: 'open' },
      unset: ['precheckAt', 'precheckBy'],
      after: async (saved: OrderDoc) => { await audit(ctx, 'order.reopen', saved, `hisob qayta ochildi (pre-chek: ${o.precheckBy ?? '—'})`); },
      result: async (saved: OrderDoc) => ({ order: await view(ctx, saved) }),
    });
  });
}

/** Buyurtmani bekor qilish — faqat oshxonaga yuborilgan faol taom va to'lov bo'lmasa */
export async function cancelOrder(ctx: RestaurantCtx, orderId: string, reason?: string): Promise<OpResult<{ order: OrderView }>> {
  const denied = needPerm(ctx, 'order.create');
  if (denied) return denied;
  return mutateOrder(ctx, orderId, (o) => {
    const err = access(ctx, o) ?? statusGuard(ctx, o, 'cancel');
    if (err) return err;
    if (o.payments.length) return fail(ctx.d, 'hasPayments');
    if (o.items.some((i) => (RESERVED_STATUSES as string[]).includes(i.status))) return fail(ctx.d, 'hasActiveItems');
    const now = new Date();
    const items = o.items.map((i): Item =>
      i.status === 'pending' || i.status === 'new'
        ? { ...i, status: 'voided', voidStage: 'unsent', voidedAt: now, voidedBy: ctx.user.username, ...(reason ? { voidReason: reason } : {}) }
        : i,
    );
    return ok({
      set: { items, status: 'cancelled', cancelledAt: now, cancelledBy: ctx.user.username, ...(reason ? { cancelReason: reason } : {}) },
      unset: ['activeTableKey'],
      after: async (saved: OrderDoc) => { await audit(ctx, 'order.cancel', saved, `buyurtma bekor qilindi${reason ? ` · sabab: ${reason}` : ''}`); },
      result: async (saved: OrderDoc) => ({ order: await view(ctx, saved) }),
    });
  });
}

/** Mehmonlar soni va izoh */
export async function updateOrderInfo(
  ctx: RestaurantCtx,
  orderId: string,
  input: { guests?: number | null; note?: string | null },
): Promise<OpResult<{ order: OrderView }>> {
  const denied = needPerm(ctx, 'order.create');
  if (denied) return denied;
  return mutateOrder(ctx, orderId, (o) => {
    const err = access(ctx, o) ?? statusGuard(ctx, o, 'edit');
    if (err) return err;
    const set: Record<string, unknown> = {};
    const unset: string[] = [];
    if (input.guests !== undefined) { if (input.guests) set.guests = input.guests; else unset.push('guests'); }
    if (input.note !== undefined) { if (input.note) set.note = input.note; else unset.push('note'); }
    return ok({ set, unset, result: async (saved: OrderDoc) => ({ order: await view(ctx, saved) }) });
  });
}

/**
 * Mijoz chaqiruvini (ofitsant / hisob) ko'rildi deb belgilash. Ofitsant (`order.create`) yoki faqat
 * «Barcha buyurtmalar» ko'radigan kassir (`order.viewAll`) — hisob so'rovini kassir ham qabul qiladi.
 */
export async function ackTableCall(ctx: RestaurantCtx, tableId: string, kind?: TableCallKind): Promise<OpResult<{ tableId: string }>> {
  const denied = needFeature(ctx, 'tables') ?? needAnyPerm(ctx, ['order.create', 'order.viewAll']);
  if (denied) return denied;
  if (!validId(tableId)) return fail(ctx.d, 'tableNotFound');
  const unset = kind === 'waiter' ? { callWaiterAt: '' } : kind === 'bill' ? { callBillAt: '' } : { callWaiterAt: '', callBillAt: '' };
  const r = await ctx.m.Table.updateOne({ _id: tableId, ...branchFilter(ctx.user) }, { $unset: unset });
  return r.matchedCount ? ok({ tableId }) : fail(ctx.d, 'tableNotFound');
}

/* ───────────────────────────── to'lov ───────────────────────────── */

export interface PayInput {
  /** Hisobni bo'lish: faqat shu taomlar (qty — taomning bir qismi). Berilmasa — barcha to'lanmagan */
  items?: { itemId: string; qty?: number }[];
  /** To'lov usullari (aralash ham; teng bo'lishda — har mehmon ulushi alohida qism) */
  parts: PayPart[];
  discount?: CartDiscount | null;
  /** Klient idempotentlik kaliti: takror yuborilsa — avvalgi natija qaytadi */
  payId?: string;
}

export interface PayResult {
  order: OrderView;
  checkoutId: string;
  saleIds: string[];
  receiptNo: string;
  total: number;
  change: number;
  /** Mijozga ulashiladigan ochiq chek */
  publicPath: string;
  /** Buyurtma to'liq yopildimi */
  closed: boolean;
}

/** Tizim «xizmat» mahsuloti (filial bo'yicha bitta): xizmat haqi va qadoq qatorlari uchun. Soft-delete — ro'yxatlarda ko'rinmaydi */
export async function ensureSystemProduct(
  Product: Model<IProduct>,
  branchId: Types.ObjectId | string,
  key: 'serviceCharge' | 'packFee',
): Promise<Types.ObjectId> {
  const imei = `SYS-${key === 'serviceCharge' ? 'SVC' : 'PACK'}-${String(branchId)}`.toUpperCase();
  const find = () => Product.findOne({ imei }).setOptions({ withDeleted: true }).select('_id').lean<{ _id: Types.ObjectId }>();
  const existing = await find();
  if (existing) return existing._id;
  try {
    const created = await Product.create({
      name: key === 'serviceCharge' ? 'Xizmat haqi' : 'Qadoq',
      imei,
      kind: 'service',
      purchasePrice: 0,
      salePrice: 0,
      trackQuantity: false,
      quantity: 1,
      status: 'in_stock',
      branchId,
      systemKey: `restaurant.${key}`,
      createdBy: 'system',
      deletedAt: new Date(),
      deletedBy: 'system',
    });
    return created._id as Types.ObjectId;
  } catch (e) {
    if (!isDupKey(e)) throw e;
    const again = await find();
    if (!again) throw e;
    return again._id;
  }
}

interface PayLine {
  kind: 'item' | 'service' | 'pack';
  item?: Item;
  total: number;
  discount: number;
}

async function payResultOf(ctx: RestaurantCtx, o: OrderDoc, p: IOrderPayment, saleNos?: string[]): Promise<PayResult> {
  const nos = [...(saleNos ?? [])].sort();
  return {
    order: await view(ctx, o),
    checkoutId: p.checkoutId,
    saleIds: (p.saleIds ?? []).map(String),
    receiptNo: nos.length > 1 ? `${nos[0]} – ${nos[nos.length - 1]}` : nos[0] ?? o.orderNo,
    total: p.total,
    change: p.change ?? 0,
    publicPath: receiptPath(ctx.orgId, p.checkoutId),
    closed: o.status === 'paid',
  };
}

/**
 * To'lov: butun buyurtma yoki tanlangan taomlar (hisobni bo'lish). Yuborilmagan taomlar avval yuboriladi.
 * Har taom → alohida naqd Sale qatori (ombor qayta band qilinmaydi), xizmat haqi va qadoq → tizim xizmat
 * mahsuloti qatorlari; to'lov usullari qatorlarga «sharshara» bo'yicha taqsimlanadi (POS bilan bir xil).
 * Hammasi yoki hech biri: Sale yozilmasa — yaratilganlari o'chadi va buyurtma to'lanmagan holatga qaytadi.
 */
export async function payOrder(ctx: RestaurantCtx, orderId: string, input: PayInput): Promise<OpResult<PayResult>> {
  const denied = needPerm(ctx, 'sale.create') ?? (input.items?.length ? needPerm(ctx, 'order.split') : null);
  if (denied) return denied;

  const pre = await loadOrder(ctx, orderId);
  if (!pre.ok) return pre;
  {
    const err = access(ctx, pre.data);
    if (err) return err;
  }
  if (input.payId) {
    const prev = pre.data.payments.find((p) => p.payId === input.payId);
    if (prev) return ok(await payResultOf(ctx, pre.data, prev));
  }
  {
    const err = statusGuard(ctx, pre.data, 'pay');
    if (err) return err;
  }
  if (pre.data.items.some((i) => i.status === 'pending')) return fail(ctx.d, 'pendingItems');
  const selected = input.items?.length ? new Set(input.items.map((x) => x.itemId)) : null;
  const unsent = pre.data.items.filter((i) => i.status === 'new' && (!selected || selected.has(String(i._id)))).map((i) => String(i._id));
  if (unsent.length) {
    const sendErr = await sendAllNew(ctx, orderId, unsent);
    if (sendErr) return sendErr;
  }

  const checkoutId = newCheckoutId();
  const now = new Date();
  const claim = await mutateOrder(ctx, orderId, (o) => {
    const err = access(ctx, o) ?? statusGuard(ctx, o, 'pay');
    if (err) return err;
    if (input.payId && o.payments.some((p) => p.payId === input.payId)) return fail(ctx.d, 'conflict');
    if (o.items.some((i) => i.status === 'pending')) return fail(ctx.d, 'pendingItems');
    const unpaid = o.items.filter((i) => isBillable(i) && !i.paidCheckoutId);

    // Tanlov: butun buyurtma yoki taomlar (qisman miqdor — qator ikkiga bo'linadi)
    let items = [...o.items];
    const targets: Item[] = [];
    if (!input.items?.length) {
      targets.push(...unpaid);
    } else {
      const seen = new Set<string>();
      for (const sel of input.items) {
        if (seen.has(sel.itemId)) return fail(ctx.d, 'badInput');
        seen.add(sel.itemId);
        const it = unpaid.find((i) => String(i._id) === sel.itemId);
        if (!it) return fail(ctx.d, o.items.some((i) => String(i._id) === sel.itemId && i.paidCheckoutId) ? 'itemPaid' : 'itemNotFound');
        const q = sel.qty !== undefined ? roundQty(sel.qty) : it.qty;
        if (!(q > 0) || q > it.qty || !isValidQty(q, it.unit)) return fail(ctx.d, 'badQty', { name: it.name });
        if (q < it.qty) {
          const part: Item = { ...it, _id: new Types.ObjectId(), qty: q };
          delete part.clientItemId;
          items = [...items.map((i) => (i === it ? { ...i, qty: roundQty(it.qty - q) } : i)), part];
          targets.push(part);
        } else {
          targets.push(it);
        }
      }
    }
    if (!targets.length) return fail(ctx.d, 'nothingToPay');
    if (targets.some((i) => i.status === 'new')) return fail(ctx.d, 'conflict');

    const packFee = !o.packFeePaid && o.packFee > 0 ? o.packFee : 0;
    const totals = computePartTotals(targets, { servicePct: effectiveServicePct(o.type, o.serviceChargePct), packFee, discount: input.discount });
    if (!totals) return fail(ctx.d, 'discountTooBig');
    if (totals.discount > 0) {
      const noDisc = needPerm(ctx, 'sale.discount');
      if (noDisc) return noDisc;
    }
    const settled = settlePayment(totals.total, input.parts, 'full');
    if (!settled.ok) return fail(ctx.d, settled.reason);

    const targetIds = new Set(targets.map((i) => String(i._id)));
    items = items.map((i) => (targetIds.has(String(i._id)) ? { ...i, paidCheckoutId: checkoutId } : i));
    const closes = !items.some((i) => isBillable(i) && !i.paidCheckoutId);
    const payment: IOrderPayment = {
      ...(input.payId ? { payId: input.payId } : {}),
      checkoutId,
      itemIds: targets.map((i) => i._id),
      saleIds: [],
      subtotal: totals.subtotal,
      discount: totals.discount,
      serviceCharge: totals.serviceCharge,
      packFee: totals.packFee,
      total: totals.total,
      parts: settled.parts,
      change: settled.change,
      paidAt: now,
      by: ctx.user.username,
    };
    return ok({
      set: {
        items,
        payments: [...o.payments, payment],
        ...(packFee ? { packFeePaid: true } : {}),
        ...(closes ? { status: 'paid', paidAt: now } : {}),
      },
      unset: closes ? ['activeTableKey'] : [],
      result: (saved: OrderDoc) => ({ saved, targets, totals, settled, payment, closes, prevStatus: o.status, packFee }),
    });
  });
  if (!claim.ok) return claim;
  const { saved, targets, totals, settled, payment, closes, prevStatus, packFee } = claim.data;

  // Sotuv qatorlari
  const created = await writeSaleLines(ctx, saved, { targets, totals, parts: settled.parts, checkoutId, now });
  if (!created.ok) {
    // Kompensatsiya: buyurtma to'lanmagan holatga qaytadi (bo'lingan qator bo'lingancha qoladi — summasi o'zgarmaydi)
    try {
      const restore: Record<string, unknown> = {};
      if (closes) restore.status = prevStatus;
      if (packFee) restore.packFeePaid = false;
      await ctx.m.Order.updateOne(
        { _id: saved._id },
        {
          $pull: { payments: { checkoutId } },
          $unset: { 'items.$[p].paidCheckoutId': '', ...(closes ? { paidAt: '' } : {}) },
          ...(Object.keys(restore).length ? { $set: restore } : {}),
          $inc: { rev: 1 },
        },
        { arrayFilters: [{ 'p.paidCheckoutId': checkoutId }] },
      );
    } catch (e) {
      logError('restaurant pay revert failed', e, { orderId: String(saved._id), checkoutId });
    }
    // Stol qayta band (shu orada boshqa buyurtma ochilgan bo'lsa — noyob indeks rad etadi, e'tiborsiz)
    if (closes && saved.tableId) {
      await ctx.m.Order.updateOne({ _id: saved._id, status: { $in: ['open', 'precheck'] } }, { $set: { activeTableKey: String(saved.tableId) } })
        .catch((e) => logError('restaurant pay revert table failed', e, { orderId: String(saved._id) }));
    }
    return created;
  }
  const { saleIds, saleNos, itemSale } = created.data;

  // Sale id'larini buyurtmaga bog'lash (qayta chop etish, qaytarish uchun)
  const itemEntries = [...itemSale.entries()];
  const arrayFilters: Record<string, unknown>[] = [{ 'pay.checkoutId': checkoutId }];
  const setLinks: Record<string, unknown> = { 'payments.$[pay].saleIds': saleIds.map((id) => new Types.ObjectId(id)) };
  itemEntries.forEach(([itemId, saleId], n) => {
    setLinks[`items.$[i${n}].saleId`] = new Types.ObjectId(saleId);
    arrayFilters.push({ [`i${n}._id`]: new Types.ObjectId(itemId) });
  });
  const linked = await ctx.m.Order.findOneAndUpdate({ _id: saved._id }, { $set: setLinks, $inc: { rev: 1 } }, { arrayFilters, new: true })
    .lean<OrderDoc>()
    .catch((e) => { logError('restaurant pay link failed', e, { orderId: String(saved._id) }); return null; });
  const finalOrder = linked ?? saved;

  const methods = settled.parts.map((p) => p.method);
  await audit(ctx, 'order.pay', finalOrder, `to'lov ${fmtMoney(totals.total)} so'm (${targets.length} ta taom${totals.serviceCharge ? `, xizmat ${fmtMoney(totals.serviceCharge)}` : ''}${totals.packFee ? `, qadoq ${fmtMoney(totals.packFee)}` : ''}${totals.discount ? `, chegirma ${fmtMoney(totals.discount)}` : ''}) · ${settled.parts.map((p) => `${p.method} ${fmtMoney(p.amount)}`).join(' + ')}${closes ? ' · yopildi' : ''}`, {
    checkoutId, total: totals.total, parts: settled.parts, saleIds, split: !!input.items?.length,
  });
  await markOnboardingStep(ctx.user.organizationId, 'saleMade');
  void notifyNewSale(ctx.user, {
    saleNo: [...saleNos].sort()[0],
    items: targets.length,
    firstItem: targets[0]?.name ?? '—',
    total: totals.total,
    payment: salePayLabel('cash', methods),
    by: finalOrder.waiterName || ctx.user.username,
  });
  const paidEntry = finalOrder.payments.find((p) => p.checkoutId === checkoutId) ?? { ...payment, saleIds: saleIds.map((id) => new Types.ObjectId(id)) };
  return ok(await payResultOf(ctx, finalOrder, paidEntry, saleNos));
}

/** To'lov qismini Sale qatorlariga yozish (hammasi yoki hech biri) */
async function writeSaleLines(
  ctx: RestaurantCtx,
  o: OrderDoc,
  p: { targets: Item[]; totals: PartTotals; parts: PayPart[]; checkoutId: string; now: Date },
): Promise<OpResult<{ saleIds: string[]; saleNos: string[]; itemSale: Map<string, string> }>> {
  const { Product, Sale } = ctx.m;
  const lines: PayLine[] = p.targets.map((item, i) => ({
    kind: 'item',
    item,
    total: p.totals.lineTotals[i] - p.totals.lineDiscounts[i],
    discount: p.totals.lineDiscounts[i],
  }));
  if (p.totals.serviceCharge > 0) lines.push({ kind: 'service', total: p.totals.serviceCharge, discount: 0 });
  if (p.totals.packFee > 0) lines.push({ kind: 'pack', total: p.totals.packFee, discount: 0 });
  const allocated = allocateParts(lines.map((l) => l.total), p.parts);

  const products = await Product.find({ _id: { $in: [...new Set(p.targets.map((i) => String(i.productId)))] } })
    .setOptions({ withDeleted: true })
    .select('imei brand deviceModel purchasePrice unit')
    .lean<ProductLean[]>();
  const pById = new Map(products.map((x) => [String(x._id), x]));
  const sys: Partial<Record<'service' | 'pack', Types.ObjectId>> = {};
  try {
    if (p.totals.serviceCharge > 0) sys.service = await ensureSystemProduct(Product, o.branchId, 'serviceCharge');
    if (p.totals.packFee > 0) sys.pack = await ensureSystemProduct(Product, o.branchId, 'packFee');
  } catch (e) {
    logError('restaurant system product failed', e);
    return fail(ctx.d, 'failed');
  }
  // Sotuv qatori nomlari bazada bir tilda (o'zbekcha) saqlanadi — chek va hisobot shu nomni ko'rsatadi
  const uz = getDictionary('uz').restaurant.common;
  const soldBy = o.waiterName || ctx.user.username;

  const outcome = await runWithCompensation(lines, async (line, i) => {
    const saleNo = await generateSaleNo(Sale);
    const prod = line.item ? pById.get(String(line.item.productId)) : undefined;
    const snapshot = line.kind === 'item' && line.item
      ? {
          name: itemDisplayName(line.item.name, line.item.modifiers),
          imei: prod?.imei || '-',
          ...(prod?.brand ? { brand: prod.brand } : {}),
          ...(prod?.deviceModel ? { deviceModel: prod.deviceModel } : {}),
          purchasePrice: prod?.purchasePrice ?? 0,
          saleQuantity: line.item.qty,
          ...(prod?.unit ? { unit: prod.unit } : {}),
        }
      : {
          name: line.kind === 'service' ? tr(uz.serviceChargeLine, { pct: effectiveServicePct(o.type, o.serviceChargePct) }) : uz.packFeeLine,
          imei: line.kind === 'service' ? 'XIZMAT' : 'QADOQ',
          purchasePrice: 0,
          saleQuantity: 1,
        };
    const sale = await Sale.create({
      saleNo,
      productId: line.kind === 'item' ? line.item!.productId : line.kind === 'service' ? sys.service : sys.pack,
      productSnapshot: snapshot,
      branchId: o.branchId,
      paymentType: 'cash',
      totalAmount: line.total,
      paidAmount: line.total,
      remainingAmount: 0,
      status: 'paid',
      payments: allocated[i].map((x) => ({ amount: x.amount, paidAt: p.now, recordedBy: ctx.user.username, method: x.method })),
      checkoutId: p.checkoutId,
      ...(line.discount > 0 ? { discount: line.discount } : {}),
      ...(line.item?.note ? { notes: line.item.note } : {}),
      soldBy,
      orderId: o._id,
      ...(o.tableNumber ? { tableNumber: o.tableNumber } : {}),
    });
    return {
      result: { saleId: String(sale._id), saleNo, itemId: line.item ? String(line.item._id) : null },
      undo: async () => { await Sale.deleteOne({ _id: sale._id }); },
    };
  });
  if (!outcome.ok) {
    if (outcome.error) logError('restaurant pay sales failed', outcome.error, { orderId: String(o._id), dbName: ctx.user.dbName });
    return fail(ctx.d, 'failed');
  }
  const itemSale = new Map<string, string>();
  for (const r of outcome.results) if (r.itemId) itemSale.set(r.itemId, r.saleId);
  return ok({ saleIds: outcome.results.map((r) => r.saleId), saleNos: outcome.results.map((r) => r.saleNo), itemSale });
}
