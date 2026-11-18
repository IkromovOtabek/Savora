import { Types, type Model } from 'mongoose';
import { getMasterModels } from '../masterDb';
import { getTenantModels } from '../tenantDb';
import { getShopSettings } from '../shopSettings';
import { isOrganizationActive } from '../models/master/Organization';
import type { IMarketOrder, MarketDelivery, MarketOrderStatus } from '../models/master/MarketOrder';
import type { IProduct } from '../models/tenant/Product';
import type { ISale } from '../models/tenant/Sale';
import { allocateCheapest, allocationTotal, buildEcomGroups, ecomGroupKey, ecomAvailableQty, splitTotal, type EcomSourceProduct } from './group';
import { ECOM_PRODUCT_PROJECTION } from './sync';
import { isValidQty, priceTimesQty, qtyLabel, roundQty, subQty } from '../qty';
import { hitRateLimit } from '../rateLimit';
import { nextDocNo, datePrefix } from '../counters';
import { generateSaleNo } from '../sales';
import { reserveStock, releaseStock } from '../stock';
import { recordAudit } from '../audit';
import { pushToShop } from '../push';
import { sendTelegramTo, tgEscape } from '../telegram';
import { escapeRegExp } from '../security';
import { logError } from '../logger';
import type { BuyerInfo } from './buyerAuth';

/**
 * E-commerce buyurtmalari. To'lov onlayn emas — topshirishda (naqd/karta).
 *  - Xaridor: savat → har do'konga alohida buyurtma (narx/qoldiq do'kon bazasidan JONLI tekshiriladi).
 *  - Do'kon: qabul → yakunlash (tovar ombordan ayriladi, naqd sotuv yoziladi — idempotent) yoki rad.
 *  - Xaridor faqat «yangi» buyurtmani bekor qila oladi.
 */

export const ORDER_MAX_LINES = 50;

export type CartLine = { listingId: string; qty: number; price?: number };
export type PlaceOrderInput = { lines: CartLine[]; delivery: MarketDelivery; address?: string; note?: string };
export type PlaceOrderError =
  | 'emptyCart' | 'badQty' | 'unavailable' | 'notEnough' | 'priceChanged' | 'addressRequired' | 'rateLimited' | 'failed';
export type PlaceOrderResult =
  | { ok: true; orders: { id: string; orderNo: string; shopName: string; total: number }[] }
  | { ok: false; error: PlaceOrderError; listingId?: string; available?: number; price?: number };

function money(n: number): string {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(n || 0));
}

/** Savat qatorlarini tozalash: yaroqsiz id tashlanadi, takrorlar qo'shiladi */
export function normalizeCart(lines: unknown): CartLine[] {
  if (!Array.isArray(lines)) return [];
  const map = new Map<string, CartLine>();
  for (const raw of lines.slice(0, ORDER_MAX_LINES * 2)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = String(r.listingId ?? '');
    const qty = Number(r.qty);
    if (!Types.ObjectId.isValid(id) || !Number.isFinite(qty) || qty <= 0) continue;
    const price = r.price === undefined || r.price === null ? undefined : Number(r.price);
    const prev = map.get(id);
    if (prev) prev.qty = roundQty(prev.qty + qty);
    else map.set(id, { listingId: id, qty: roundQty(qty), price: Number.isFinite(price) ? price : undefined });
  }
  return [...map.values()].slice(0, ORDER_MAX_LINES);
}

type PlannedItem = {
  listingId: Types.ObjectId; key: string; name: string; image?: string; price: number; qty: number; unit?: string;
  total: number; productIds: Types.ObjectId[];
};

export async function placeMarketOrders(buyer: BuyerInfo, input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const rl = await hitRateLimit(`ecom-order:${buyer.id}`, 20, 60 * 60_000);
  if (!rl.ok) return { ok: false, error: 'rateLimited' };
  const lines = normalizeCart(input.lines);
  if (lines.length === 0) return { ok: false, error: 'emptyCart' };
  const address = String(input.address ?? '').trim().slice(0, 300);
  const note = String(input.note ?? '').trim().slice(0, 500);
  if (input.delivery === 'delivery' && address.length < 5) return { ok: false, error: 'addressRequired' };

  const { MarketListing, Organization, MarketOrder, Buyer } = await getMasterModels();
  const listings = await MarketListing.find({ _id: { $in: lines.map((l) => l.listingId) } }).lean();
  const byId = new Map(listings.map((l) => [String(l._id), l]));
  for (const l of lines) if (!byId.has(l.listingId)) return { ok: false, error: 'unavailable', listingId: l.listingId };

  // Do'konlar bo'yicha — har biri alohida buyurtma
  const byOrg = new Map<string, CartLine[]>();
  for (const l of lines) {
    const org = String(byId.get(l.listingId)!.orgId);
    byOrg.set(org, [...(byOrg.get(org) ?? []), l]);
  }

  const plans: { org: { _id: Types.ObjectId; name: string; slug: string; dbName: string; telegramChatId?: string }; items: PlannedItem[] }[] = [];
  for (const [orgId, orgLines] of byOrg) {
    const org = await Organization.findById(orgId).select('name slug dbName status expiresAt telegramChatId').lean();
    if (!org || !isOrganizationActive(org)) return { ok: false, error: 'unavailable', listingId: orgLines[0].listingId };
    const m = await getTenantModels(org.dbName);
    const settings = await getShopSettings(m.ShopSettings);
    const autoPublish = settings.ecom?.autoPublish !== false;

    const items: PlannedItem[] = [];
    for (const line of orgLines) {
      const listing = byId.get(line.listingId)!;
      const docs = await m.Product.find({ _id: { $in: listing.productIds }, status: 'in_stock' }, ECOM_PRODUCT_PROJECTION)
        .lean<EcomSourceProduct[]>();
      const g = buildEcomGroups(docs, autoPublish).find((x) => x.key === listing.key);
      if (!g || g.state !== 'live') return { ok: false, error: 'unavailable', listingId: line.listingId };
      if (!isValidQty(line.qty, g.unit)) return { ok: false, error: 'badQty', listingId: line.listingId };
      if (line.qty > g.qty) return { ok: false, error: 'notEnough', listingId: line.listingId, available: g.qty };
      if (line.price !== undefined && line.price !== g.price) {
        return { ok: false, error: 'priceChanged', listingId: line.listingId, price: g.price };
      }
      // Narxlar har xil bo'lsa — eng arzonidan boshlab; jami haqiqiy narxlardan (bitta narxda: narx × miqdor)
      const sellSet = new Set(g.sellIds);
      const allocs = allocateCheapest(docs.filter((x) => sellSet.has(String(x._id))), line.qty);
      if (!allocs) return { ok: false, error: 'notEnough', listingId: line.listingId, available: g.qty };
      items.push({
        listingId: listing._id, key: listing.key, name: listing.name, image: listing.images[0], price: g.price,
        qty: line.qty, unit: g.unit, total: g.maxPrice > g.price ? allocationTotal(allocs) : priceTimesQty(g.price, line.qty),
        productIds: g.sellIds.map((id) => new Types.ObjectId(id)),
      });
    }
    plans.push({ org: { _id: org._id, name: org.name, slug: org.slug, dbName: org.dbName, telegramChatId: org.telegramChatId }, items });
  }

  const created: { id: string; orderNo: string; shopName: string; total: number }[] = [];
  try {
    for (const p of plans) {
      const total = p.items.reduce((s, i) => s + i.total, 0);
      const orderNo = await nextDocNo(MarketOrder, 'orderNo', 'ecom', datePrefix('E'));
      const o = await MarketOrder.create({
        orderNo, buyerId: new Types.ObjectId(buyer.id), buyerName: buyer.name, buyerPhone: buyer.phone,
        orgId: p.org._id, shopSlug: p.org.slug, shopName: p.org.name, items: p.items, total,
        delivery: input.delivery, address: input.delivery === 'delivery' ? address : undefined, note: note || undefined,
        status: 'new', history: [{ status: 'new', at: new Date(), by: buyer.name }],
      });
      created.push({ id: String(o._id), orderNo, shopName: p.org.name, total });
      void notifyShopNewOrder(p.org, { orderNo, total, buyerName: buyer.name, items: p.items.length, firstItem: p.items[0].name, delivery: input.delivery });
    }
  } catch (e) {
    logError('ecom.placeOrder', e, { buyer: buyer.id });
    if (created.length === 0) return { ok: false, error: 'failed' };
  }
  if (input.delivery === 'delivery' && address && address !== buyer.address) {
    await Buyer.updateOne({ _id: buyer.id }, { $set: { address } }).catch(() => {});
  }
  return { ok: true, orders: created };
}

async function notifyShopNewOrder(
  org: { name: string; dbName: string; telegramChatId?: string },
  o: { orderNo: string; total: number; buyerName: string; items: number; firstItem: string; delivery: MarketDelivery },
): Promise<void> {
  const what = o.items > 1 ? `${o.firstItem} va yana ${o.items - 1} ta` : o.firstItem;
  const how = o.delivery === 'delivery' ? 'yetkazib berish' : 'olib ketish';
  try {
    await pushToShop(org.dbName, { admins: true }, {
      title: `Onlayn buyurtma ${o.orderNo} · ${money(o.total)} so'm`,
      body: `${o.buyerName}: ${what} (${how})`,
      url: '/ecom-orders',
    });
    if (org.telegramChatId) {
      await sendTelegramTo(org.telegramChatId, [
        `🛒 <b>${tgEscape(org.name)}</b> — yangi onlayn buyurtma <b>${tgEscape(o.orderNo)}</b>`,
        `${tgEscape(o.buyerName)}: ${tgEscape(what)}`,
        `Jami: <b>${money(o.total)} so'm</b> · ${how}`,
      ].join('\n'));
    }
  } catch (e) {
    logError('ecom.notifyShop', e, { orderNo: o.orderNo });
  }
}

// ── Xaridor tomoni ────────────────────────────────────────────────────────────

export type OrderView = {
  id: string; orderNo: string; shopName: string; shopSlug: string; status: MarketOrderStatus; total: number;
  delivery: MarketDelivery; address?: string; note?: string; reason?: string; createdAt: string;
  buyerName?: string; buyerPhone?: string;
  items: { listingId: string; name: string; image?: string; price: number; qty: number; unit?: string; total: number }[];
  history: { status: MarketOrderStatus; at: string }[];
};

type OrderDoc = IMarketOrder & { _id: Types.ObjectId };

export function orderView(o: OrderDoc, opts: { forShop?: boolean } = {}): OrderView {
  return {
    id: String(o._id), orderNo: o.orderNo, shopName: o.shopName, shopSlug: o.shopSlug, status: o.status, total: o.total,
    delivery: o.delivery, address: o.address, note: o.note, reason: o.reason,
    createdAt: new Date(o.createdAt ?? Date.now()).toISOString(),
    ...(opts.forShop ? { buyerName: o.buyerName, buyerPhone: o.buyerPhone } : {}),
    items: o.items.map((i) => ({ listingId: String(i.listingId), name: i.name, image: i.image, price: i.price, qty: i.qty, unit: i.unit, total: i.total })),
    history: (o.history ?? []).map((h) => ({ status: h.status, at: new Date(h.at).toISOString() })),
  };
}

export async function buyerOrders(buyerId: string, limit = 50): Promise<OrderView[]> {
  const { MarketOrder } = await getMasterModels();
  const list = await MarketOrder.find({ buyerId }).sort({ createdAt: -1 }).limit(limit).lean<OrderDoc[]>();
  return list.map((o) => orderView(o));
}

export async function cancelBuyerOrder(buyerId: string, orderId: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(orderId)) return false;
  const { MarketOrder } = await getMasterModels();
  const r = await MarketOrder.updateOne(
    { _id: orderId, buyerId, status: 'new' },
    { $set: { status: 'cancelled' }, $push: { history: { status: 'cancelled', at: new Date(), by: 'xaridor' } } },
  );
  return r.modifiedCount > 0;
}

// ── Do'kon tomoni ─────────────────────────────────────────────────────────────

export const ACTIVE_ORDER_STATUSES: MarketOrderStatus[] = ['new', 'accepted'];

export async function shopOrders(orgId: string, scope: 'active' | 'done', limit = 100): Promise<OrderView[]> {
  const { MarketOrder } = await getMasterModels();
  const status = scope === 'active' ? { $in: ACTIVE_ORDER_STATUSES } : { $nin: ACTIVE_ORDER_STATUSES };
  const list = await MarketOrder.find({ orgId, status }).sort({ createdAt: -1 }).limit(limit).lean<OrderDoc[]>();
  return list.map((o) => orderView(o, { forShop: true }));
}

export async function countNewShopOrders(orgId: string): Promise<number> {
  const { MarketOrder } = await getMasterModels();
  return MarketOrder.countDocuments({ orgId, status: 'new' });
}

export type ShopActor = { id: string; username: string; role: 'admin' | 'user'; dbName: string; branchId?: string };
export type ShopOrderError = 'notFound' | 'badState' | 'notEnough' | 'failed';
export type ShopOrderResult = { ok: true; saleNos?: string[] } | { ok: false; error: ShopOrderError; item?: string };

/** Qabul qilish / rad etish */
export async function setShopOrderStatus(
  orgId: string, actor: ShopActor, orderId: string, action: 'accept' | 'reject', reason?: string,
): Promise<ShopOrderResult> {
  if (!Types.ObjectId.isValid(orderId)) return { ok: false, error: 'notFound' };
  const { MarketOrder } = await getMasterModels();
  const from: MarketOrderStatus[] = action === 'accept' ? ['new'] : ['new', 'accepted'];
  const to: MarketOrderStatus = action === 'accept' ? 'accepted' : 'rejected';
  const why = String(reason ?? '').trim().slice(0, 300) || undefined;
  const o = await MarketOrder.findOneAndUpdate(
    { _id: orderId, orgId, status: { $in: from } },
    { $set: { status: to, ...(why ? { reason: why } : {}) }, $push: { history: { status: to, at: new Date(), by: actor.username, note: why } } },
    { new: true },
  ).lean();
  if (!o) {
    const exists = await MarketOrder.exists({ _id: orderId, orgId });
    return { ok: false, error: exists ? 'badState' : 'notFound' };
  }
  await recordAudit(actor, {
    action: `ecom.${action}`, entity: 'order', entityId: orderId,
    summary: `Onlayn buyurtma ${o.orderNo}: ${action === 'accept' ? 'qabul qilindi' : `rad etildi${why ? ` (${why})` : ''}`}`,
  });
  return { ok: true };
}

type ProductLean = IProduct & { _id: Types.ObjectId };
type Alloc = { doc: ProductLean; qty: number };

/** Buyurtma qatori uchun ombordagi hujjatlar (eng arzonidan) — yetmasa null */
async function allocate(Product: Model<IProduct>, item: IMarketOrder['items'][number], qty: number): Promise<Alloc[] | null> {
  const goods = { status: 'in_stock', kind: { $nin: ['service', 'bundle'] }, systemKey: { $exists: false } };
  let docs = item.productIds?.length
    ? await Product.find({ _id: { $in: item.productIds }, ...goods }).lean<ProductLean[]>()
    : [];
  docs = docs.filter((d) => ecomGroupKey(d) === item.key);
  if (docs.reduce((s, d) => s + ecomAvailableQty(d as EcomSourceProduct), 0) < qty) {
    // Guruhga keyin qo'shilgan nusxalar (yangi kirim, boshqa filial) — nom bo'yicha
    const first = item.name.split(' · ')[0].trim();
    const more = await Product.find({ ...goods, name: { $regex: `^\\s*${escapeRegExp(first)}\\s*$`, $options: 'i' }, _id: { $nin: docs.map((d) => d._id) } })
      .limit(500).lean<ProductLean[]>();
    docs = docs.concat(more.filter((d) => ecomGroupKey(d) === item.key));
  }
  return allocateCheapest(docs as (ProductLean & EcomSourceProduct)[], qty);
}

/**
 * Yakunlash: tovarlar ombordan ayriladi va har hujjat uchun naqd sotuv yoziladi (summa — buyurtma jamidan,
 * hujjat narxi ulushida). Idempotent: sotuv kaliti `ecom-<buyurtma>-<qator>-<n>`; avvalgi urinishda yozilgan
 * sotuvlar hisobga olinadi — qayta bosilsa ikki marta ayirilmaydi, faqat qolgan qismi bajariladi.
 */
export async function completeShopOrder(orgId: string, actor: ShopActor, orderId: string): Promise<ShopOrderResult> {
  if (!Types.ObjectId.isValid(orderId)) return { ok: false, error: 'notFound' };
  const { MarketOrder } = await getMasterModels();
  const o = await MarketOrder.findOne({ _id: orderId, orgId }).lean<OrderDoc>();
  if (!o) return { ok: false, error: 'notFound' };
  if (!ACTIVE_ORDER_STATUSES.includes(o.status)) return { ok: false, error: 'badState' };

  const { Product, Sale } = await getTenantModels(actor.dbName);
  const prefix = `ecom-${orderId}-`;
  const prior = await Sale.find({ clientSaleId: { $regex: `^${prefix}` } }, { clientSaleId: 1, saleNo: 1, totalAmount: 1, 'productSnapshot.saleQuantity': 1 }).lean();
  const done = new Map<number, { qty: number; amount: number; nextJ: number }>();
  for (const s of prior) {
    const [i, j] = String(s.clientSaleId).slice(prefix.length).split('-').map(Number);
    const cur = done.get(i) ?? { qty: 0, amount: 0, nextJ: 0 };
    cur.qty = roundQty(cur.qty + (s.productSnapshot?.saleQuantity ?? 0));
    cur.amount += s.totalAmount ?? 0;
    cur.nextJ = Math.max(cur.nextJ, (j || 0) + 1);
    done.set(i, cur);
  }

  // Avval hammasi yetadimi — yarim bajarilgan buyurtma qolmasin
  const plan: { idx: number; allocs: Alloc[]; amounts: number[]; startJ: number }[] = [];
  for (let i = 0; i < o.items.length; i++) {
    const item = o.items[i];
    const d = done.get(i);
    const left = subQty(item.qty, d?.qty ?? 0);
    if (left <= 0) continue;
    const allocs = await allocate(Product, item, left);
    if (!allocs) return { ok: false, error: 'notEnough', item: item.name };
    const amounts = splitTotal(Math.max(0, item.total - (d?.amount ?? 0)), allocs.map((a) => a.doc.salePrice * a.qty));
    plan.push({ idx: i, allocs, amounts, startJ: d?.nextJ ?? 0 });
  }

  const saleNos: string[] = prior.map((s) => s.saleNo).filter((x): x is string => !!x);
  for (const { idx, allocs, amounts, startJ } of plan) {
    const item = o.items[idx];
    for (let j = 0; j < allocs.length; j++) {
      const r = await recordEcomSale({ Product, Sale }, actor, o, allocs[j], amounts[j], `${prefix}${idx}-${startJ + j}`);
      if (!r) return { ok: false, error: 'notEnough', item: item.name };
      saleNos.push(r);
    }
  }

  await MarketOrder.updateOne(
    { _id: orderId, orgId, status: { $in: ACTIVE_ORDER_STATUSES } },
    { $set: { status: 'completed', saleNos }, $push: { history: { status: 'completed', at: new Date(), by: actor.username } } },
  );
  await recordAudit(actor, {
    action: 'ecom.complete', entity: 'order', entityId: orderId,
    summary: `Onlayn buyurtma ${o.orderNo} yakunlandi: ${money(o.total)} so'm (${saleNos.join(', ')})`,
  });
  return { ok: true, saleNos };
}

async function recordEcomSale(
  m: { Product: Model<IProduct>; Sale: Model<ISale> },
  actor: ShopActor,
  o: OrderDoc,
  a: Alloc,
  amount: number,
  clientSaleId: string,
): Promise<string | null> {
  const dup = await m.Sale.findOne({ clientSaleId }, { saleNo: 1 }).lean();
  if (dup) return dup.saleNo ?? '';
  const p = a.doc;
  const reserved = await reserveStock(m.Product, p._id, a.qty, {
    set: { soldPaymentType: 'cash' },
    history: { action: 'sold', detail: `${qtyLabel(a.qty, p.unit)} · onlayn ${o.orderNo}`, by: actor.username, at: new Date() },
  });
  if (!reserved) return null;
  try {
    const saleNo = await generateSaleNo(m.Sale);
    const sale = await m.Sale.create({
      saleNo,
      productId: p._id,
      productSnapshot: {
        name: p.name, imei: p.imei, brand: p.brand, deviceModel: p.deviceModel, purchasePrice: p.purchasePrice,
        saleQuantity: a.qty, unit: p.unit,
      },
      branchId: p.branchId,
      paymentType: 'cash',
      totalAmount: amount,
      paidAmount: amount,
      remainingAmount: 0,
      status: 'paid',
      payments: amount > 0 ? [{ amount, paidAt: new Date(), note: `Onlayn buyurtma ${o.orderNo}`, recordedBy: actor.username }] : [],
      soldBy: actor.username,
      notes: `Onlayn buyurtma ${o.orderNo} · ${o.buyerName} ${o.buyerPhone}`,
      clientSaleId,
    });
    await recordAudit(actor, {
      action: 'sale.create', entity: 'sale', entityId: String(sale._id),
      summary: `Onlayn sotuv ${saleNo}: ${p.name} · ${qtyLabel(a.qty, p.unit)} · ${money(amount)} so'm (${o.orderNo})`,
      meta: { saleQty: a.qty, totalAmount: amount, paymentType: 'cash', ecomOrder: o.orderNo },
    });
    return saleNo;
  } catch (e) {
    await releaseStock(m.Product, p._id, a.qty);
    if ((e as { code?: number })?.code === 11000) {
      const again = await m.Sale.findOne({ clientSaleId }, { saleNo: 1 }).lean();
      if (again) return again.saleNo ?? '';
    }
    logError('ecom.recordSale', e, { order: o.orderNo });
    return null;
  }
}
