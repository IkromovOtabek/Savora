/**
 * Mijoz QR-menyusi (ochiq, login yo'q) — server, DB. Faqat `qrMenu` (va `tables`) moduli yoqilgan, faol
 * do'konda ishlaydi. Tenant do'kon slug'i orqali, stol — tasodifiy `qrToken` orqali topiladi.
 * Umumiy mijoz sahifasi (/m/<slug>, stolsiz, faqat o'qish) — resolvePublicStore / publicStoreMenu (pastda).
 * Javobda faqat mijozga kerakli maydonlar (tannarx, qoldiq, ichki id'lar, xodim loginlari — yo'q).
 * Rate-limit — route'da (app/api/public/menu/...).
 *
 * Mijoz buyurtmasi taomlari `pending` holatda qo'shiladi: ofitsant tasdiqlamaguncha oshxonaga ketmaydi va
 * ombor band qilinmaydi (soxta buyurtmaga qarshi). Stolda ochiq buyurtma bo'lsa — unga qo'shiladi,
 * bo'lmasa `qr_self` turidagi yangi buyurtma (xizmat haqi 0%) ochiladi.
 */
import { Types } from 'mongoose';
import type { OrderDoc, IOrderItem } from '../models/tenant/Order';
import { getMasterModels } from '../masterDb';
import { getTenantModels } from '../tenantDb';
import { isOrganizationActive } from '../models/master/Organization';
import { resolveOrgFeatures } from '../features';
import { resolvePublicFileUrl } from '../fileUrl';
import { getDictionary, type Dict } from '../i18n/dict';
import { datePrefix, nextDocNo } from '../counters';
import { isDupKey } from '../posSync';
import { recordAudit } from '../audit';
import { computeBill } from './bill';
import { itemDisplayName } from './modifiers';
import { isMenuSlug, isQrToken } from './qr';
import { toPublicInfo, type PublicRestaurantInfo } from './info';
import { RESTAURANT_LIMITS, type ItemStatus, type RestaurantSettings, type TableCallKind } from './types';
import { fail, ok, type OpResult, type RestaurantModels } from './context';
import { prepareItems, restaurantSettings, type AddItemInput } from './ops';
import { buildMenu, type MenuItemView } from './queries';
import { notifyInBackground } from '../notify';
import { notifyTableCall } from './tableCalls';

export interface PublicTableCtx {
  org: { id: string; name: string; slug: string; dbName: string };
  m: RestaurantModels;
  table: { _id: Types.ObjectId; number: number; branchId: Types.ObjectId; hallId: Types.ObjectId };
  d: Dict;
}

/** Slug + token → do'kon va stol. Yaroqsiz, o'chirilgan modul yoki faol bo'lmagan do'kon — `qrUnavailable` */
export async function resolvePublicTable(slug: string, token: string, d: Dict = getDictionary('uz')): Promise<OpResult<PublicTableCtx>> {
  if (!isMenuSlug(slug) || !isQrToken(token)) return fail(d, 'qrUnavailable');
  const { Organization } = await getMasterModels();
  const org = await Organization.findOne({ slug }).select('name slug dbName status expiresAt plan features businessType').lean();
  if (!org || !isOrganizationActive(org)) return fail(d, 'qrUnavailable');
  const features = resolveOrgFeatures(org);
  if (!features.qrMenu || !features.tables) return fail(d, 'qrUnavailable');
  const m = await getTenantModels(org.dbName);
  const table = await m.Table.findOne({ qrToken: token, active: true }).select('number branchId hallId').lean();
  if (!table) return fail(d, 'qrUnavailable');
  return ok({ org: { id: String(org._id), name: org.name, slug: org.slug, dbName: org.dbName }, m, table, d });
}

/** Mijozga ko'rinadigan taom — faqat shu maydonlar (ro'yxat oq: MenuItemView'ga keyin qo'shilgan ichki maydon chiqmaydi) */
export type PublicMenuItem = Pick<MenuItemView, 'id' | 'name' | 'price' | 'photoUrl' | 'category' | 'categoryId' | 'kind' | 'unit' | 'modifierGroups'>;

/** Ichki maydonlar (stansiya, qoldiq, stop-list, MXIK, tannarx, retsept) chiqmaydi */
export function toPublicItem(i: MenuItemView): PublicMenuItem {
  return {
    id: i.id,
    name: i.name,
    price: i.price,
    photoUrl: i.photoUrl,
    category: i.category,
    categoryId: i.categoryId,
    kind: i.kind,
    unit: i.unit,
    modifierGroups: i.modifierGroups.map((g) => ({
      id: g.id,
      name: g.name,
      required: g.required,
      min: g.min,
      max: g.max,
      options: g.options.map((o) => ({ id: o.id, name: o.name, price: o.price })),
    })),
  };
}

export type PublicBrand = { logoUrl: string | null; color: string | null; coverUrl: string | null };

function publicBrand(b: RestaurantSettings['brand']): PublicBrand {
  return {
    logoUrl: b.logoUrl ? resolvePublicFileUrl(b.logoUrl) : null,
    color: b.color ?? null,
    coverUrl: b.coverUrl ? resolvePublicFileUrl(b.coverUrl) : null,
  };
}

export interface PublicMenu {
  org: { name: string };
  brand: PublicBrand;
  table: { number: number; hall: string | null };
  /** Xizmat haqi (zalda ofitsant xizmatida). QR orqali o'zi buyurtmada olinmaydi */
  serviceChargePct: number;
  categories: string[];
  items: PublicMenuItem[];
}

export async function publicMenu(c: PublicTableCtx): Promise<PublicMenu> {
  const [settings, hall, menu] = await Promise.all([
    restaurantSettings(c.m),
    c.m.Hall.findById(c.table.hallId).select('name').lean(),
    buildMenu(c.m, c.table.branchId, { forPublic: true }),
  ]);
  return {
    org: { name: c.org.name },
    brand: publicBrand(settings.brand),
    table: { number: c.table.number, hall: hall?.name ?? null },
    serviceChargePct: settings.serviceChargePct,
    categories: menu.categories,
    items: menu.items.map(toPublicItem),
  };
}

/* ───────────────────────── umumiy mijoz sahifasi (/m/<slug>, stolsiz) ───────────────────────── */

export interface PublicStoreCtx {
  org: { id: string; name: string; slug: string };
  m: RestaurantModels;
  /** Menyu qaysi filialdan: birinchi faol zal filiali (admin standarti bilan bir xil), bo'lmasa asosiy filial */
  branchId: Types.ObjectId | null;
}

/**
 * Slug → do'kon (stol tokenisiz). Shartlar stol sahifasi bilan bir xil: faol do'kon, `qrMenu` va `tables`
 * modullari yoqiq. Aks holda — `qrUnavailable` (sabab ochilmaydi). Hech narsa yozmaydi (asosiy filial yaratilmaydi).
 */
export async function resolvePublicStore(slug: string, d: Dict = getDictionary('uz')): Promise<OpResult<PublicStoreCtx>> {
  if (!isMenuSlug(slug)) return fail(d, 'qrUnavailable');
  const { Organization } = await getMasterModels();
  const org = await Organization.findOne({ slug }).select('name slug dbName status expiresAt plan features businessType').lean();
  if (!org || !isOrganizationActive(org)) return fail(d, 'qrUnavailable');
  const features = resolveOrgFeatures(org);
  if (!features.qrMenu || !features.tables) return fail(d, 'qrUnavailable');
  const m = await getTenantModels(org.dbName);
  const hall = await m.Hall.findOne({ active: true }).sort({ createdAt: 1 }).select('branchId').lean();
  let branchId: Types.ObjectId | null = hall?.branchId ?? null;
  if (!branchId) {
    const b = (await m.Branch.findOne({ isMain: true }).select('_id').lean())
      ?? (await m.Branch.findOne({ active: true }).sort({ createdAt: 1 }).select('_id').lean());
    branchId = b?._id ?? null;
  }
  return ok({ org: { id: String(org._id), name: org.name, slug: org.slug }, m, branchId });
}

export interface PublicStorePage {
  org: { name: string; slug: string };
  brand: PublicBrand;
  /** Manzil, telefon, ish vaqti, ijtimoiy tarmoqlar (bo'sh — null) */
  info: PublicRestaurantInfo;
  /** Xizmat haqi (zalda ofitsant xizmatida) — oldindan e'lon */
  serviceChargePct: number;
  categories: string[];
  items: PublicMenuItem[];
}

/** Mijoz sahifasi ma'lumoti (faqat o'qish): brend, aloqa, menyu (stop-list va tugaganlar yashirin) */
export async function publicStoreMenu(c: PublicStoreCtx): Promise<PublicStorePage> {
  const [settings, menu] = await Promise.all([
    restaurantSettings(c.m),
    c.branchId ? buildMenu(c.m, c.branchId, { forPublic: true }) : Promise.resolve({ categories: [] as string[], items: [] as MenuItemView[] }),
  ]);
  return {
    org: { name: c.org.name, slug: c.org.slug },
    brand: publicBrand(settings.brand),
    info: toPublicInfo(settings.info),
    serviceChargePct: settings.serviceChargePct,
    categories: menu.categories,
    items: menu.items.map(toPublicItem),
  };
}

/**
 * Kesh (jarayon ichida, slug bo'yicha, 30 s): sahifa va ochiq API bir manbadan o'qiydi; indekslanadigan sahifa
 * (qidiruv botlari) har ochilishda bazaga tushmasin. «Topilmadi» ham keshlanadi (ko'r-ko'rona slug terishga qarshi).
 * Sozlama saqlanganda shu jarayonda tozalanadi (forgetPublicStore); boshqa instance'da — ko'pi bilan 30 s eski.
 */
export const PUBLIC_STORE_TTL_MS = 30_000;
const STORE_CACHE_MAX = 500;
const storeCache = new Map<string, { at: number; page: PublicStorePage | null }>();
const storeInflight = new Map<string, Promise<PublicStorePage | null>>();

export async function loadPublicStorePage(slug: string): Promise<PublicStorePage | null> {
  if (!isMenuSlug(slug)) return null;
  const hit = storeCache.get(slug);
  if (hit && Date.now() - hit.at < PUBLIC_STORE_TTL_MS) return hit.page;
  const running = storeInflight.get(slug);
  if (running) return running;
  const p = (async () => {
    const r = await resolvePublicStore(slug);
    const page = r.ok ? await publicStoreMenu(r.data) : null;
    storeCache.delete(slug);
    storeCache.set(slug, { at: Date.now(), page });
    if (storeCache.size > STORE_CACHE_MAX) {
      const oldest = storeCache.keys().next().value;
      if (oldest !== undefined) storeCache.delete(oldest);
    }
    return page;
  })().finally(() => storeInflight.delete(slug));
  storeInflight.set(slug, p);
  return p;
}

/** Sozlama o'zgarganda (shu jarayon) — keyingi ochilishda yangisi */
export function forgetPublicStore(slug?: string): void {
  if (slug) storeCache.delete(slug);
  else storeCache.clear();
}

export interface PublicOrderStatus {
  orderNo: string | null;
  items: { name: string; qty: number; price: number; total: number; status: ItemStatus }[];
  /** To'lanadigan summa (xizmat haqi bilan) */
  due: number;
  serviceCharge: number;
}

/** Stoldagi ochiq buyurtma holati (mijoz «Buyurtmangiz» bo'limi) — bekor qilinganlarsiz */
export async function publicOrderStatus(c: PublicTableCtx): Promise<PublicOrderStatus> {
  const o = await c.m.Order.findOne({ activeTableKey: String(c.table._id) })
    .select('orderNo type serviceChargePct packFee packFeePaid items payments').lean<OrderDoc>();
  if (!o) return { orderNo: null, items: [], due: 0, serviceCharge: 0 };
  const bill = computeBill(o);
  return {
    orderNo: o.orderNo,
    items: o.items.filter((i) => i.status !== 'voided').map((i) => ({
      name: itemDisplayName(i.name, i.modifiers), qty: i.qty, price: i.price, total: Math.round(i.price * i.qty), status: i.status,
    })),
    due: bill.due,
    serviceCharge: bill.dueServiceCharge,
  };
}

export interface PublicOrderInput {
  /** Mijoz qurilmasi bergan kalit (8–40 belgi) — takroriy yuborish ikki marta yozilmasin */
  clientOrderId: string;
  items: { productId: string; qty: number; optionIds?: string[]; note?: string }[];
}

/** Mijoz buyurtmasi: taomlar `pending` (ofitsant tasdiqlaydi). Idempotent — `clientOrderId` bo'yicha */
export async function publicPlaceOrder(c: PublicTableCtx, input: PublicOrderInput): Promise<OpResult<PublicOrderStatus & { added: number }>> {
  const { d } = c;
  if (!input.items.length || input.items.length > RESTAURANT_LIMITS.maxQrItems) return fail(d, 'badInput');
  if (input.items.some((i) => i.qty > RESTAURANT_LIMITS.maxQrQty)) return fail(d, 'badInput');
  const inputs: AddItemInput[] = input.items.map((x, n) => ({ ...x, clientItemId: `${input.clientOrderId}:${n}` }));
  const tableKey = String(c.table._id);

  for (let attempt = 0; attempt < 3; attempt++) {
    const open = await c.m.Order.findOne({ activeTableKey: tableKey }).lean<OrderDoc>();
    if (open) {
      if (open.status !== 'open') return fail(d, 'orderLocked');
      const known = new Set(open.items.map((i) => i.clientItemId).filter(Boolean));
      const fresh = inputs.filter((x) => !known.has(x.clientItemId));
      if (!fresh.length) return ok({ ...(await publicOrderStatus(c)), added: 0 });
      const pendingNow = open.items.filter((i) => i.status === 'pending').length;
      if (pendingNow + fresh.length > 50) return fail(d, 'qrTooManyPending');
      if (open.items.length + fresh.length > RESTAURANT_LIMITS.maxOrderItems) return fail(d, 'tooManyItems');
      const prepared = await prepareItems(c.m, d, open.branchId, fresh, { addedBy: 'qr', status: 'pending', fromQr: true });
      if (!prepared.ok) return prepared;
      const saved = await c.m.Order.findOneAndUpdate(
        { _id: open._id, rev: open.rev ?? 0, status: 'open' },
        { $set: { items: [...open.items, ...prepared.data] }, $inc: { rev: 1 } },
        { new: true },
      ).lean();
      if (!saved) continue;
      await auditQr(c, saved, `mijoz QR orqali ${prepared.data.length} ta taom qo'shdi (tasdiqlanmagan)`);
      return ok({ ...(await publicOrderStatus(c)), added: prepared.data.length });
    }

    // Yangi qr_self buyurtma (ofitsantsiz, xizmat haqi 0%)
    const prepared = await prepareItems(c.m, d, c.table.branchId, inputs, { addedBy: 'qr', status: 'pending', fromQr: true });
    if (!prepared.ok) return prepared;
    const orderNo = await nextDocNo(c.m.Order, 'orderNo', 'order', datePrefix('B'));
    try {
      const created = await c.m.Order.create({
        orderNo,
        branchId: c.table.branchId,
        type: 'qr_self',
        source: 'qr',
        status: 'open',
        tableId: c.table._id,
        tableNumber: c.table.number,
        hallId: c.table.hallId,
        activeTableKey: tableKey,
        serviceChargePct: 0,
        packFee: 0,
        items: prepared.data as IOrderItem[],
        payments: [],
        clientOrderId: input.clientOrderId,
        openedBy: 'qr',
        openedAt: new Date(),
        rev: 0,
      });
      await auditQr(c, created.toObject(), `mijoz QR orqali buyurtma ochdi (${prepared.data.length} ta taom, tasdiqlanmagan)`);
      return ok({ ...(await publicOrderStatus(c)), added: prepared.data.length });
    } catch (e) {
      if (!isDupKey(e)) throw e;
      // Shu clientOrderId bilan allaqachon yaratilgan (takroriy yuborish) yoki stol shu payt ochildi — qayta urinish
      if (await c.m.Order.exists({ clientOrderId: input.clientOrderId })) return ok({ ...(await publicOrderStatus(c)), added: 0 });
    }
  }
  return fail(d, 'conflict');
}

/**
 * «Ofitsantni chaqirish» / «Hisob so'rash» — stolga vaqt belgisi (ofitsant stollar taxtasida ko'radi) va bildirishnoma
 * (qo'ng'iroqcha + push: stol ofitsantiga, bo'lmasa filial ofitsantlariga — lib/restaurant/tableCalls.ts). Bildirishnoma
 * fonda: mijoz javobni kutmaydi; 2 daqiqada takror bosish — bitta xabar.
 */
export async function publicCall(c: PublicTableCtx, kind: TableCallKind): Promise<OpResult<{ kind: TableCallKind; at: string }>> {
  const at = new Date();
  await c.m.Table.updateOne({ _id: c.table._id }, { $set: kind === 'waiter' ? { callWaiterAt: at } : { callBillAt: at } });
  notifyInBackground(() => notifyTableCall({ id: c.org.id, dbName: c.org.dbName }, c.m, c.table, kind), 'qr call notify');
  return ok({ kind, at: at.toISOString() });
}

function auditQr(c: PublicTableCtx, o: { _id: unknown; orderNo: string; tableNumber?: number | null }, summary: string) {
  // Mijoz — tizim foydalanuvchisi emas; audit «qr» nomidan (by: 'qr')
  return recordAudit({ username: 'qr', role: 'user', dbName: c.org.dbName }, {
    action: 'order.qr',
    entity: 'order',
    entityId: String(o._id),
    summary: `${o.orderNo}${o.tableNumber ? ` (stol ${o.tableNumber})` : ''}: ${summary}`,
  });
}
