/**
 * Restoran «Menyu» bo'limi (/app/menu) — server, DB. Menyu va ombor ajratilgan (menuFlags.ts):
 *   - Taom (`kind: 'bundle'` + retsept `bundleItems` — xom ashyo asosiy birlikda): o'zi omborda saqlanmaydi,
 *     oshxonaga yuborilganda retsept xom ashyosi ombordan chiqadi (ops.reserveForItems → reserveStock);
 *   - Tayyor tovar (ombordagi sanaladigan tovar, `menuItem: true`): o'zi ombordan chiqadi;
 *   - Xizmat (`kind: 'service'`) — retseptsiz taom, ombor o'zgarmaydi.
 * Huquqlar: ko'rish — product.create | product.edit | menu.stopList; taom qo'shish — product.create; tahrirlash,
 * tovarni menyuga qo'shish/olish — product.edit; tannarx/foyda — product.viewCost. Modul — `tables`.
 * Retsept o'zgarishi auditga yoziladi (`product.recipe`: oldin → keyin).
 */
import { Types } from 'mongoose';
import type { IProduct, IBundleItem } from '../models/tenant/Product';
import { PRODUCT_UNITS, type ProductUnit } from '../businessTypes';
import { branchFilter } from '../branchScope';
import { recordAudit } from '../audit';
import { generateProductCode, generateSku } from '../productId';
import { getStockQty } from '../productQuantity';
import { BUNDLE_MAX_ITEMS } from '../productKinds';
import { isValidQty, qtyLabel, roundQty } from '../qty';
import { parseMxikInput } from '../mxik';
import { isOwnUploadUrl, resolvePublicFileUrl } from '../fileUrl';
import { tr } from '../i18n/fmt';
import { normalizeModifierGroups } from './modifiers';
import { resolveBranchId } from './ops';
import { needAnyPerm, needFeature, needPerm, ok, type OpErr, type OpResult, type RestaurantCtx } from './context';
import { ensureMenuFlags, isOnMenu, MENU_KINDS, onMenuFilter } from './menuFlags';
import { marginPct, portionsFrom, recipeLineCost } from './recipeUnits';
import type { StationKind } from './types';

const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

export type MenuItemType = 'dish' | 'goods' | 'service';
export const MENU_ITEM_TYPES: readonly MenuItemType[] = ['dish', 'goods', 'service'];
export const MENU_LIMITS = { name: 120, price: 1_000_000_000, recipe: BUNDLE_MAX_ITEMS } as const;

const typeOf = (p: { kind?: string | null }): MenuItemType => (p.kind === 'bundle' ? 'dish' : p.kind === 'service' ? 'service' : 'goods');

/** Kirish xatosi: kod `badInput`, matn — d.menu.errors (restoran xato kodlari ro'yxati o'zgarmaydi) */
function bad(error: string, status = 400): OpErr {
  return { ok: false, code: 'badInput', error, status };
}

async function branchesFor(ctx: RestaurantCtx): Promise<{ id: string; name: string; isMain: boolean }[]> {
  if (ctx.user.role !== 'admin') return [];
  const list = await ctx.m.Branch.find({ active: true }).select('name isMain').sort({ createdAt: 1 }).lean();
  return list.map((b) => ({ id: String(b._id), name: b.name, isMain: !!b.isMain }));
}

const MENU_VIEW_PERMS = ['product.create', 'product.edit', 'menu.stopList'] as const;

export interface MenuCan {
  create: boolean;
  edit: boolean;
  stop: boolean;
  viewCost: boolean;
}

function canOf(ctx: RestaurantCtx): MenuCan {
  return {
    create: ctx.perms.has('product.create'),
    edit: ctx.perms.has('product.edit'),
    stop: ctx.perms.has('menu.stopList'),
    viewCost: ctx.perms.has('product.viewCost'),
  };
}

/* ───────────────────────────── ombor ma'lumoti (tannarx, qoldiq) ───────────────────────────── */

type Lean = IProduct & { _id: Types.ObjectId };
type StockInfo = { name: string; unit: string | null; available: number; price: number };

/** Xom ashyo qoldig'i va kelish narxi (id → ma'lumot); tugagan/o'chirilgan — 0 */
async function stockInfo(ctx: RestaurantCtx, ids: readonly string[]): Promise<Map<string, StockInfo>> {
  const out = new Map<string, StockInfo>();
  if (!ids.length) return out;
  const docs = await ctx.m.Product.find(
    { _id: { $in: ids } },
    { name: 1, unit: 1, trackQuantity: 1, quantity: 1, soldQuantity: 1, status: 1, kind: 1, purchasePrice: 1 },
  ).lean<Lean[]>();
  for (const c of docs) {
    out.set(String(c._id), {
      name: c.name,
      unit: c.unit ?? null,
      available: c.status === 'in_stock' || c.status === 'sold' ? getStockQty(c) : 0,
      price: c.purchasePrice ?? 0,
    });
  }
  return out;
}

/** Taom tannarxi (joriy kelish narxlarida) va porsiya soni */
function recipeStats(items: readonly IBundleItem[] | undefined, stock: Map<string, StockInfo>): { cost: number; portions: number } {
  const list = items ?? [];
  let cost = 0;
  for (const it of list) cost += recipeLineCost(stock.get(String(it.productId))?.price ?? 0, it.qty);
  return { cost, portions: portionsFrom(list.map((it) => ({ qty: it.qty, available: stock.get(String(it.productId))?.available ?? 0 }))) };
}

/* ───────────────────────────── Menyu ro'yxati ───────────────────────────── */

export interface MenuRow {
  id: string;
  name: string;
  type: MenuItemType;
  price: number;
  photoUrl: string | null;
  category: string | null;
  stationId: string | null;
  stopListed: boolean;
  /** Necha porsiya: taom — retsept xom ashyosi qoldig'idan, tovar — qoldiq; null — cheklovsiz (xizmat). 0 — «Tugagan» */
  portions: number | null;
  /** Retseptdagi xom ashyo soni (taom) */
  recipeCount: number;
  modifierCount: number;
  ikpu: string | null;
  /** Tannarx (product.viewCost bo'lmasa — null): taom — retseptdan joriy narxda, tovar — kelish narxi, xizmat — kiritilgani */
  cost: number | null;
  /** Foyda % sotuv narxiga nisbatan (marja) */
  margin: number | null;
}

export interface MenuAdminView {
  branchId: string;
  branches: { id: string; name: string; isMain: boolean }[];
  stations: { id: string; name: string; kind: StationKind; active: boolean }[];
  categories: string[];
  items: MenuRow[];
  /** Menyudan olingan taom/xizmatlar (qaytarish mumkin) */
  hidden: MenuRow[];
  can: MenuCan;
  /** false — menyu belgilari tayyor emas (eski rejim: barcha mahsulot menyuda) */
  flags: boolean;
}

/** /app/menu: filial menyusi (taom, tovar, xizmat) — porsiya, tannarx, foyda; menyudan olinganlar alohida */
export async function menuAdminView(ctx: RestaurantCtx, input: { branchId?: string } = {}): Promise<OpResult<MenuAdminView>> {
  const denied = needFeature(ctx, 'tables') ?? needAnyPerm(ctx, MENU_VIEW_PERMS);
  if (denied) return denied;
  const br = await resolveBranchId(ctx, input.branchId);
  if (!br.ok) return br;
  const branchId = br.data;
  const can = canOf(ctx);
  const flags = await ensureMenuFlags(ctx.m);
  const fields = {
    name: 1, salePrice: 1, purchasePrice: 1, photoUrl: 1, category: 1, kind: 1, unit: 1, trackQuantity: 1, quantity: 1,
    soldQuantity: 1, status: 1, bundleItems: 1, stationId: 1, modifierGroups: 1, stopListed: 1, systemKey: 1, ikpu: 1, menuItem: 1,
  };
  const status = { $or: [{ status: 'in_stock' }, { status: 'sold', trackQuantity: true }] };
  const [products, hiddenDocs, stations, branches] = await Promise.all([
    ctx.m.Product.find({ branchId, $and: [status, ...(flags ? [onMenuFilter()] : [])] }, fields)
      .sort({ category: 1, name: 1 }).limit(1000).lean<Lean[]>(),
    flags
      ? ctx.m.Product.find({ branchId, menuItem: false, kind: { $in: MENU_KINDS } }, fields).sort({ name: 1 }).limit(300).lean<Lean[]>()
      : Promise.resolve([] as Lean[]),
    ctx.m.KitchenStation.find({ branchId }).sort({ sort: 1, createdAt: 1 }).select('name kind active').lean(),
    branchesFor(ctx),
  ]);
  const all = [...products, ...hiddenDocs].filter((p) => !p.systemKey);
  const compIds = [...new Set(all.flatMap((p) => (p.kind === 'bundle' ? (p.bundleItems ?? []).map((i) => String(i.productId)) : [])))];
  const stock = await stockInfo(ctx, compIds);

  const row = (p: Lean): MenuRow => {
    const type = typeOf(p);
    const stats = type === 'dish' ? recipeStats(p.bundleItems, stock) : null;
    const cost = !can.viewCost ? null : stats ? stats.cost : p.purchasePrice ?? 0;
    return {
      id: String(p._id),
      name: p.name,
      type,
      price: p.salePrice ?? 0,
      photoUrl: p.photoUrl ? resolvePublicFileUrl(p.photoUrl) : null,
      category: p.category ?? null,
      stationId: p.stationId ? String(p.stationId) : null,
      stopListed: !!p.stopListed,
      portions: stats ? stats.portions : type === 'goods' ? (p.trackQuantity ? getStockQty(p) : p.status === 'in_stock' ? 1 : 0) : null,
      recipeCount: p.bundleItems?.length ?? 0,
      modifierCount: p.modifierGroups?.length ?? 0,
      ikpu: p.ikpu || null,
      cost,
      margin: cost === null ? null : marginPct(p.salePrice ?? 0, cost),
    };
  };
  const items = products.filter((p) => !p.systemKey).map(row);
  return ok({
    branchId,
    branches,
    stations: stations.map((s) => ({ id: String(s._id), name: s.name, kind: s.kind, active: s.active })),
    categories: [...new Set(items.map((i) => i.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)),
    items,
    hidden: hiddenDocs.filter((p) => !p.systemKey).map(row),
    can,
    flags,
  });
}

/* ───────────────────────────── taom formasi ───────────────────────────── */

/** Retsept muharriri va «Tayyor tovar» tanlovi uchun ombor tovari */
export interface StockOption {
  id: string;
  name: string;
  unit: string | null;
  /** Qoldiq (asosiy birlikda) */
  available: number;
  /** Kelish narxi asosiy birlik uchun (viewCost bo'lmasa — 0) */
  cost: number;
  /** Sotuv narxi (tayyor tovar uchun) */
  price: number;
  /** Miqdori yuritiladi (retseptga faqat shunday tovar) */
  tracked: boolean;
  /** Tayyor tovarni menyuga qo'shishda formani to'ldirish uchun: turkum va stansiya */
  categoryId?: string | null;
  stationId?: string | null;
}

export interface DishFormValue {
  id: string;
  type: MenuItemType;
  name: string;
  price: number;
  photoUrl: string | null;
  categoryId: string | null;
  /** Turkumga bog'lanmagan eski kategoriya matni */
  categoryName: string | null;
  stationId: string | null;
  ikpu: string | null;
  modifierGroups: { name: string; required: boolean; min: number; max: number; options: { name: string; price: number }[] }[];
  /** Retsept (asosiy birlikda) */
  recipe: { productId: string; qty: number }[];
  /** Xizmat: qo'lda kiritilgan tannarx (viewCost bo'lmasa — null) */
  cost: number | null;
  /** Tayyor tovar: ombor birligi va qoldig'i */
  unit: string | null;
  available: number | null;
  stopListed: boolean;
}

export interface DishFormData {
  branchId: string;
  branches: { id: string; name: string; isMain: boolean }[];
  dish: DishFormValue | null;
  /** Menyuda bo'lmagan ombor tovarlari (+ retseptdagilar) */
  stock: StockOption[];
  categories: { id: string; name: string; parentId: string | null }[];
  stations: { id: string; name: string; kind: StationKind; active: boolean }[];
  can: MenuCan;
}

/** Taom qo'shish (id yo'q) yoki tahrirlash formasi ma'lumoti */
export async function dishFormData(ctx: RestaurantCtx, input: { id?: string; branchId?: string } = {}): Promise<OpResult<DishFormData>> {
  // Yangi: taom/xizmat — product.create, ombordagi tovarni menyuga qo'shish — product.edit (forma turlarni shunga ko'ra cheklaydi)
  const denied = needFeature(ctx, 'tables') ?? (input.id ? needPerm(ctx, 'product.edit') : needAnyPerm(ctx, ['product.create', 'product.edit']));
  if (denied) return denied;
  const can = canOf(ctx);
  let doc: Lean | null = null;
  if (input.id) {
    if (!validId(input.id)) return bad(ctx.d.restaurant.errors.productNotFound, 404);
    doc = await ctx.m.Product.findOne({ _id: input.id, ...branchFilter(ctx.user) }).lean<Lean>();
    if (!doc || doc.systemKey) return bad(ctx.d.restaurant.errors.productNotFound, 404);
  }
  const br = await resolveBranchId(ctx, doc ? String(doc.branchId) : input.branchId);
  if (!br.ok) return br;
  const branchId = br.data;
  await ensureMenuFlags(ctx.m);
  const recipeIds = (doc?.bundleItems ?? []).map((i) => String(i.productId));
  const [stockDocs, cats, stations, branches] = await Promise.all([
    // Ombor: menyuda bo'lmagan sanaladigan tovarlar (xom ashyo) + retseptdagilar (menyuda bo'lsa ham)
    ctx.m.Product.find(
      {
        $or: [
          { branchId, kind: { $nin: MENU_KINDS }, menuItem: { $ne: true }, status: { $in: ['in_stock', 'sold'] }, systemKey: { $exists: false } },
          ...(recipeIds.length ? [{ _id: { $in: recipeIds } }] : []),
        ],
      },
      { name: 1, unit: 1, trackQuantity: 1, quantity: 1, soldQuantity: 1, status: 1, kind: 1, purchasePrice: 1, salePrice: 1, categoryId: 1, stationId: 1 },
    ).sort({ name: 1 }).limit(1500).lean<Lean[]>(),
    ctx.m.ProductCategory.find({}, { name: 1, parentId: 1 }).sort({ name: 1 }).limit(2000).lean(),
    ctx.m.KitchenStation.find({ branchId }).sort({ sort: 1, createdAt: 1 }).select('name kind active').lean(),
    branchesFor(ctx),
  ]);
  const stock: StockOption[] = stockDocs
    .filter((p) => !doc || String(p._id) !== String(doc._id))
    .map((p) => ({
      id: String(p._id),
      name: p.name,
      unit: p.unit ?? null,
      available: p.status === 'in_stock' || p.status === 'sold' ? getStockQty(p) : 0,
      cost: can.viewCost ? p.purchasePrice ?? 0 : 0,
      price: p.salePrice ?? 0,
      tracked: !!p.trackQuantity,
      categoryId: p.categoryId ? String(p.categoryId) : null,
      stationId: p.stationId ? String(p.stationId) : null,
    }));
  const dish: DishFormValue | null = doc
    ? {
      id: String(doc._id),
      type: typeOf(doc),
      name: doc.name,
      price: doc.salePrice ?? 0,
      photoUrl: doc.photoUrl ?? null,
      categoryId: doc.categoryId ? String(doc.categoryId) : null,
      categoryName: doc.category ?? null,
      stationId: doc.stationId ? String(doc.stationId) : null,
      ikpu: doc.ikpu || null,
      modifierGroups: (doc.modifierGroups ?? []).map((g) => ({
        name: g.name, required: !!g.required, min: g.min ?? 0, max: g.max ?? 1,
        options: (g.options ?? []).map((o) => ({ name: o.name, price: o.price ?? 0 })),
      })),
      recipe: (doc.bundleItems ?? []).map((i) => ({ productId: String(i.productId), qty: i.qty })),
      cost: doc.kind === 'service' && can.viewCost ? doc.purchasePrice ?? 0 : null,
      unit: doc.unit ?? null,
      available: typeOf(doc) === 'goods' ? getStockQty(doc) : null,
      stopListed: !!doc.stopListed,
    }
    : null;
  return ok({
    branchId,
    branches: doc ? [] : branches,
    dish,
    stock,
    categories: cats.map((c) => ({ id: String(c._id), name: c.name, parentId: c.parentId ? String(c.parentId) : null })),
    stations: stations.map((s) => ({ id: String(s._id), name: s.name, kind: s.kind, active: s.active })),
    can,
  });
}

/* ───────────────────────────── saqlash ───────────────────────────── */

export interface DishInput {
  /** Tahrirlanayotgan mahsulot */
  id?: string;
  type: MenuItemType;
  /** Yangi «Tayyor tovar»: menyuga qo'shiladigan ombor tovari */
  productId?: string;
  /** Yangi taom qaysi filial menyusiga (admin; filial xodimida — o'z filiali) */
  branchId?: string;
  name: string;
  price: number;
  categoryId?: string | null;
  photoUrl?: string | null;
  stationId?: string | null;
  ikpu?: string | null;
  modifierGroups?: unknown;
  /** Taom retsepti — xom ashyoning asosiy birligida */
  recipe?: { productId: string; qty: number }[];
  /** Xizmat: taxminiy tannarx (product.viewCost bo'lsa) */
  cost?: number | null;
}

/** Ishonchsiz kirishni tekshirish (server action'dan): turlar, uzunliklar, id'lar */
export function parseDishInput(raw: unknown): DishInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const type = r.type as MenuItemType;
  if (!MENU_ITEM_TYPES.includes(type)) return null;
  const optId = (v: unknown) => (v === undefined ? undefined : v === null || v === '' ? null : validId(v) ? v : false);
  const id = r.id === undefined || r.id === null || r.id === '' ? undefined : validId(r.id) ? r.id : false;
  const productId = r.productId === undefined || r.productId === null || r.productId === '' ? undefined : validId(r.productId) ? r.productId : false;
  const branchId = r.branchId === undefined || r.branchId === null || r.branchId === '' ? undefined : validId(r.branchId) ? r.branchId : false;
  const categoryId = optId(r.categoryId);
  const stationId = optId(r.stationId);
  if (id === false || productId === false || branchId === false || categoryId === false || stationId === false) return null;
  if (typeof r.name !== 'string') return null;
  const price = typeof r.price === 'number' ? r.price : Number(r.price);
  if (!Number.isSafeInteger(price) || price < 0 || price > MENU_LIMITS.price) return null;
  const str = (v: unknown, max: number) => (v === undefined ? undefined : v === null ? null : typeof v === 'string' && v.length <= max ? v : false);
  const photoUrl = str(r.photoUrl, 600);
  const ikpu = str(r.ikpu, 40);
  if (photoUrl === false || ikpu === false) return null;
  let recipe: { productId: string; qty: number }[] | undefined;
  if (r.recipe !== undefined) {
    if (!Array.isArray(r.recipe) || r.recipe.length > MENU_LIMITS.recipe) return null;
    recipe = [];
    for (const x of r.recipe as unknown[]) {
      const it = x as Record<string, unknown>;
      if (!it || typeof it !== 'object' || !validId(it.productId) || typeof it.qty !== 'number' || !Number.isFinite(it.qty)) return null;
      recipe.push({ productId: it.productId, qty: it.qty });
    }
  }
  let cost: number | null | undefined;
  if (r.cost !== undefined && r.cost !== null && r.cost !== '') {
    const c = typeof r.cost === 'number' ? r.cost : Number(r.cost);
    if (!Number.isSafeInteger(c) || c < 0 || c > MENU_LIMITS.price) return null;
    cost = c;
  } else if (r.cost === null || r.cost === '') cost = null;
  return {
    ...(id ? { id } : {}), type, ...(productId ? { productId } : {}), ...(branchId ? { branchId } : {}),
    name: r.name, price,
    ...(categoryId !== undefined ? { categoryId } : {}),
    ...(photoUrl !== undefined ? { photoUrl } : {}),
    ...(stationId !== undefined ? { stationId } : {}),
    ...(ikpu !== undefined ? { ikpu } : {}),
    ...(r.modifierGroups !== undefined ? { modifierGroups: r.modifierGroups } : {}),
    ...(recipe ? { recipe } : {}),
    ...(cost !== undefined ? { cost } : {}),
  };
}

type RecipeLine = { productId: Types.ObjectId; qty: number; name: string; unit: string | null; price: number };

/** Retsept: shu filialdagi sanaladigan oddiy tovarlar, takrorsiz, o'zi emas; miqdor asosiy birlikka mos */
async function checkRecipe(
  ctx: RestaurantCtx,
  list: readonly { productId: string; qty: number }[],
  branchId: string,
  selfId: string | null,
): Promise<{ ok: true; lines: RecipeLine[]; cost: number } | OpErr> {
  const t = ctx.d.menu.errors;
  if (!list.length) return bad(t.recipeEmpty);
  if (list.length > MENU_LIMITS.recipe) return bad(tr(t.recipeTooMany, { n: MENU_LIMITS.recipe }));
  const ids = list.map((x) => x.productId);
  if (new Set(ids).size !== ids.length || (selfId && ids.includes(selfId))) return bad(t.recipeBad);
  const docs = await ctx.m.Product.find(
    { _id: { $in: ids }, branchId },
    { name: 1, kind: 1, trackQuantity: 1, unit: 1, purchasePrice: 1, systemKey: 1 },
  ).lean<Lean[]>();
  const byId = new Map(docs.map((p) => [String(p._id), p]));
  const lines: RecipeLine[] = [];
  let cost = 0;
  for (const x of list) {
    const p = byId.get(x.productId);
    if (!p || p.systemKey) return bad(t.recipeNotFound);
    if (p.kind === 'bundle' || p.kind === 'service' || !p.trackQuantity) return bad(tr(t.recipeNotCountable, { name: p.name }));
    // Asosiy birlikda: kasrli birlikda ≤3 xona (1 g aniqlik), dona — butun; yaxlitlab «to'g'rilanmaydi»
    if (!isValidQty(x.qty, p.unit)) return bad(tr(t.recipeBadQty, { name: p.name }));
    const qty = roundQty(x.qty);
    lines.push({ productId: p._id, qty, name: p.name, unit: p.unit ?? null, price: p.purchasePrice ?? 0 });
    cost += recipeLineCost(p.purchasePrice ?? 0, qty);
  }
  return { ok: true, lines, cost };
}

/** Audit uchun retsept farqi: «Guruch 0,15 kg → 0,2 kg; + Zira 0,005 kg; − Sabzi» */
function recipeDiff(before: { id: string; qty: number; name: string; unit: string | null }[], after: RecipeLine[]): string {
  const prev = new Map(before.map((b) => [b.id, b]));
  const parts: string[] = [];
  for (const a of after) {
    const b = prev.get(String(a.productId));
    if (!b) parts.push(`+ ${a.name} ${qtyLabel(a.qty, a.unit)}`);
    else if (b.qty !== a.qty) parts.push(`${a.name} ${qtyLabel(b.qty, a.unit)} → ${qtyLabel(a.qty, a.unit)}`);
    prev.delete(String(a.productId));
  }
  for (const b of prev.values()) parts.push(`− ${b.name}`);
  return parts.join('; ');
}

/**
 * Taom/tovar/xizmatni menyuga qo'shish yoki tahrirlash. Yangi taom/xizmat — product.create; tahrir va ombordagi
 * tovarni menyuga qo'shish — product.edit. Taom tannarxi (purchasePrice) retseptdan qayta hisoblanadi (sotuv
 * hisobotlarida foyda to'g'ri chiqsin). Tovar turini almashtirib bo'lmaydi (taom ↔ xizmat — mumkin).
 */
export async function saveMenuDish(ctx: RestaurantCtx, input: DishInput): Promise<OpResult<{ id: string; created: boolean }>> {
  const off = needFeature(ctx, 'tables');
  if (off) return off;
  const t = ctx.d.menu.errors;
  const creating = !input.id;
  const addingGoods = creating && input.type === 'goods';
  const denied = needPerm(ctx, creating && !addingGoods ? 'product.create' : 'product.edit');
  if (denied) return denied;
  const viewCost = ctx.perms.has('product.viewCost');

  // Mavjud mahsulot (tahrir yoki ombordagi tovar)
  const targetId = input.id ?? (addingGoods ? input.productId : undefined);
  if (addingGoods && !targetId) return bad(t.pickGoods);
  let doc: Lean | null = null;
  if (targetId) {
    doc = await ctx.m.Product.findOne({ _id: targetId, ...branchFilter(ctx.user) }).lean<Lean>();
    if (!doc || doc.systemKey) return bad(ctx.d.restaurant.errors.productNotFound, 404);
    const cur = typeOf(doc);
    if (cur === 'goods' ? input.type !== 'goods' : input.type === 'goods') return bad(t.typeChange);
    if (addingGoods && isOnMenu(doc)) return bad(t.alreadyInMenu);
  }

  let branchId: string;
  if (doc) branchId = String(doc.branchId);
  else {
    const br = await resolveBranchId(ctx, input.branchId);
    if (!br.ok) return br;
    branchId = br.data;
  }

  const name = input.name.trim().replace(/\s+/g, ' ');
  if (!name) return bad(t.nameRequired);
  if (name.length > MENU_LIMITS.name) return bad(t.nameTooLong);

  const set: Record<string, unknown> = { name, salePrice: input.price, menuItem: true };
  const unset: Record<string, ''> = {};

  // Kategoriya (turkum)
  if (input.categoryId !== undefined) {
    if (input.categoryId === null) { unset.categoryId = ''; unset.category = ''; }
    else {
      const c = await ctx.m.ProductCategory.findById(input.categoryId, { name: 1 }).lean();
      if (!c) return bad(ctx.d.stock.msg.categoryNotFound);
      set.categoryId = c._id;
      set.category = c.name;
    }
  }
  // Rasm — faqat o'zimizning storage (o'zgarmagan eski rasm qayta tekshirilmaydi)
  if (input.photoUrl !== undefined) {
    const url = (input.photoUrl ?? '').trim();
    if (!url) unset.photoUrl = '';
    else if (url !== doc?.photoUrl) {
      if (!ctx.features.mediaUpload || !isOwnUploadUrl(url)) return bad(ctx.d.stock.msg.photoUrlInvalid);
      set.photoUrl = url;
    }
  }
  // Stansiya — shu filialniki
  if (input.stationId !== undefined) {
    if (input.stationId === null) unset.stationId = '';
    else {
      const st = await ctx.m.KitchenStation.findOne({ _id: input.stationId, branchId }).select('_id').lean();
      if (!st) return bad(ctx.d.restaurant.errors.stationNotFound, 404);
      set.stationId = new Types.ObjectId(input.stationId);
    }
  }
  if (input.modifierGroups !== undefined) {
    const g = normalizeModifierGroups(input.modifierGroups ?? []);
    if (!g.ok) return bad(ctx.d.restaurant.errors.badModifierGroups);
    if (g.groups.length) set.modifierGroups = g.groups;
    else unset.modifierGroups = '';
  }
  if (input.ikpu !== undefined) {
    const v = parseMxikInput(input.ikpu ?? '');
    if (v === null) return bad(ctx.d.stock.mxik.invalid);
    if (v) set.ikpu = v;
    else unset.ikpu = '';
  }

  // Tur bo'yicha: retsept / tannarx
  let recipe: RecipeLine[] | null = null;
  if (input.type === 'dish') {
    const r = await checkRecipe(ctx, input.recipe ?? [], branchId, doc ? String(doc._id) : null);
    if (!r.ok) return r;
    recipe = r.lines;
    set.kind = 'bundle';
    set.bundleItems = r.lines.map((l) => ({ productId: l.productId, qty: l.qty }));
    set.purchasePrice = r.cost;
  } else if (input.type === 'service') {
    set.kind = 'service';
    if (doc?.kind === 'bundle') unset.bundleItems = '';
    if (viewCost && input.cost !== undefined) set.purchasePrice = input.cost ?? 0;
    else if (!doc) set.purchasePrice = 0;
    // Tahrirda tannarx ko'rinmasa — eski qiymat qoladi (taomdan xizmatga o'tganda — retsept tannarxi)
  }
  for (const k of Object.keys(unset)) delete set[k];

  const now = new Date();
  const via = ctx.via ?? '';
  if (!doc) {
    // Yangi taom / xizmat (o'z qoldig'i yo'q, menyuda)
    const created = await ctx.m.Product.create({
      productId: generateProductCode(),
      imei: generateSku(),
      ...set,
      purchasePrice: (set.purchasePrice as number | undefined) ?? 0,
      trackQuantity: false,
      quantity: 1,
      soldQuantity: 0,
      status: 'in_stock',
      branchId,
      unit: 'dona',
      createdBy: ctx.user.username,
      history: [{ action: 'created', detail: 'Menyu', by: ctx.user.username, at: now }],
    });
    const id = String(created._id);
    await recordAudit(ctx.user, {
      action: 'product.create', entity: 'product', entityId: id,
      summary: `Menyuga qo'shildi: ${name}${recipe ? ` (retsept: ${recipe.map((l) => `${l.name} ${qtyLabel(l.qty, l.unit)}`).join(', ')})` : ''}${via}`,
    });
    return ok({ id, created: true });
  }

  const id = String(doc._id);
  // Retsept farqi (audit)
  let diff = '';
  if (recipe) {
    const prevIds = (doc.bundleItems ?? []).map((i) => String(i.productId));
    const prevInfo = await stockInfo(ctx, prevIds);
    diff = recipeDiff((doc.bundleItems ?? []).map((i) => ({
      id: String(i.productId), qty: i.qty, name: prevInfo.get(String(i.productId))?.name ?? '—', unit: prevInfo.get(String(i.productId))?.unit ?? null,
    })), recipe);
  }
  await ctx.m.Product.updateOne(
    { _id: doc._id },
    {
      ...(Object.keys(set).length ? { $set: set } : {}),
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
      $push: { history: { action: 'edited', detail: addingGoods ? "Menyuga qo'shildi" : 'Menyu', by: ctx.user.username, at: now } },
    },
  );
  await recordAudit(ctx.user, {
    action: addingGoods ? 'product.menuOn' : 'product.menu', entity: 'product', entityId: id,
    summary: `«${name}»: ${addingGoods ? "ombordagi tovar menyuga qo'shildi" : 'menyu bandi saqlandi'}${via}`,
  });
  if (diff) {
    await recordAudit(ctx.user, {
      action: 'product.recipe', entity: 'product', entityId: id,
      summary: `«${name}» retsepti: ${diff}${via}`,
      meta: {
        before: (doc.bundleItems ?? []).map((i) => ({ productId: String(i.productId), qty: i.qty })),
        after: recipe!.map((l) => ({ productId: String(l.productId), qty: l.qty })),
      },
    });
  }
  return ok({ id, created: false });
}

/** Menyuga qo'shish / menyudan olish (mahsulot o'chmaydi: tovar omborda qoladi, taom «Menyudan olinganlar»da) */
export async function setMenuMembership(ctx: RestaurantCtx, productId: string, inMenu: boolean): Promise<OpResult<{ id: string; name: string; inMenu: boolean }>> {
  const denied = needFeature(ctx, 'tables') ?? needPerm(ctx, 'product.edit');
  if (denied) return denied;
  if (!validId(productId)) return bad(ctx.d.restaurant.errors.productNotFound, 404);
  await ensureMenuFlags(ctx.m);
  const p = await ctx.m.Product.findOneAndUpdate(
    { _id: productId, systemKey: { $exists: false }, ...branchFilter(ctx.user) },
    {
      $set: { menuItem: inMenu },
      $push: { history: { action: 'edited', detail: inMenu ? "Menyuga qo'shildi" : 'Menyudan olindi', by: ctx.user.username, at: new Date() } },
    },
    { new: true },
  ).select('name').lean();
  if (!p) return bad(ctx.d.restaurant.errors.productNotFound, 404);
  await recordAudit(ctx.user, {
    action: inMenu ? 'product.menuOn' : 'product.menuOff', entity: 'product', entityId: productId,
    summary: `«${p.name}» ${inMenu ? "menyuga qo'shildi" : 'menyudan olindi'}${ctx.via ?? ''}`,
  });
  return ok({ id: productId, name: p.name, inMenu });
}

export interface IngredientInput {
  branchId?: string;
  name: string;
  unit: string;
  /** Kelish narxi — 1 asosiy birlik uchun (1 kg, 1 l, 1 dona) */
  cost: number;
  /** Hozirgi qoldiq (asosiy birlikda), > 0 */
  qty: number;
}

/** Retsept muharriridan tez xom ashyo qo'shish (omborga, menyuga emas) — product.create */
export async function quickCreateIngredient(ctx: RestaurantCtx, input: IngredientInput): Promise<OpResult<StockOption>> {
  const denied = needFeature(ctx, 'tables') ?? needPerm(ctx, 'product.create');
  if (denied) return denied;
  const t = ctx.d.menu.errors;
  const name = String(input.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return bad(t.nameRequired);
  if (name.length > MENU_LIMITS.name) return bad(t.nameTooLong);
  if (!(PRODUCT_UNITS as readonly string[]).includes(input.unit)) return bad(t.badUnit);
  const unit = input.unit as ProductUnit;
  if (!Number.isSafeInteger(input.cost) || input.cost < 0 || input.cost > MENU_LIMITS.price) return bad(t.badCost);
  const qty = roundQty(Number(input.qty));
  if (!isValidQty(qty, unit)) return bad(t.badStockQty);
  const br = await resolveBranchId(ctx, input.branchId);
  if (!br.ok) return br;
  const now = new Date();
  const doc = await ctx.m.Product.create({
    productId: generateProductCode(),
    imei: generateSku(),
    kind: 'goods',
    name,
    purchasePrice: input.cost,
    salePrice: 0,
    trackQuantity: true,
    quantity: qty,
    soldQuantity: 0,
    status: 'in_stock',
    branchId: br.data,
    unit,
    menuItem: false,
    createdBy: ctx.user.username,
    history: [{ action: 'created', detail: 'Menyu: retsept uchun xom ashyo', by: ctx.user.username, at: now }],
  });
  await recordAudit(ctx.user, {
    action: 'product.create', entity: 'product', entityId: String(doc._id),
    summary: `Xom ashyo qo'shildi: ${name} (${qtyLabel(qty, unit)})${ctx.via ?? ''}`,
  });
  return ok({
    id: String(doc._id), name, unit, available: qty,
    cost: ctx.perms.has('product.viewCost') ? input.cost : 0, price: 0, tracked: true,
  });
}

/* ───────────────────────────── ombor: qaysi taomlarda ishlatiladi ───────────────────────────── */

/** Xom ashyo → uni retseptida ishlatadigan taomlar (Ombor ro'yxati uchun) */
export async function ingredientUsage(
  m: Pick<RestaurantCtx['m'], 'Product'>,
  ids: readonly string[],
): Promise<Map<string, { id: string; name: string }[]>> {
  const out = new Map<string, { id: string; name: string }[]>();
  const valid = ids.filter(validId);
  if (!valid.length) return out;
  const dishes = await m.Product.find(
    { kind: 'bundle', 'bundleItems.productId': { $in: valid.map((id) => new Types.ObjectId(id)) }, systemKey: { $exists: false } },
    { name: 1, 'bundleItems.productId': 1 },
  ).sort({ name: 1 }).limit(2000).lean<Lean[]>();
  const want = new Set(valid);
  for (const dish of dishes) {
    for (const it of dish.bundleItems ?? []) {
      const k = String(it.productId);
      if (!want.has(k)) continue;
      const list = out.get(k) ?? [];
      if (!list.some((x) => x.id === String(dish._id))) list.push({ id: String(dish._id), name: dish.name });
      out.set(k, list);
    }
  }
  return out;
}
