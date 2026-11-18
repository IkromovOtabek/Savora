/**
 * Texkarta (BOM) — CRUD, versiya, ehtiyoj hisobi va taxminiy tannarx (server, DB). Hujjat: docs/SEX_API.md §4.
 *
 *  - Xom ashyo va tayyor mahsulot BARQAROR KOD bilan saqlanadi (lib/production/stock.ts → ensureItemCode).
 *  - Qator xarid birligida kiritilsa (masalan «qop»), asosiy birlikka o'giriladi (1 qop = 50 kg).
 *  - Tarkib o'zgarsa versiya +1 (eskisi `prevVersions` da). Optimistik tekshiruv — `expectedVersion`.
 */
import type { IRecipeComposition, IRecipeItem, IRecipeOperation, RecipeDoc, RecipeMode } from '../models/tenant/Recipe';
import type { ProductDoc } from '../models/tenant/Product';
import type { ProductUnit } from '../businessTypes';
import { branchFilter } from '../branchScope';
import { roundQty } from '../qty';
import { estimateUnitCost, planMaterials, PRODUCTION_LIMITS as L, unitFactor } from './calc';
import { codeOf, ensureItemCode, findStockDoc, GOODS_ONLY } from './stock';
import { audit, pageArgs, resolveOwnBranch, searchRegex } from './common';
import { canViewProdCost, fail, guard, iso, ok, validId, type OpResult, type ProductionCtx } from './context';

/* ───────────────────────────── ko'rinish ───────────────────────────── */

export interface RecipeView {
  id: string;
  name: string;
  mode: RecipeMode;
  outputCode: string;
  outputName: string;
  /** Texkarta shu miqdor tayyor mahsulot uchun (partiya) */
  outputQty: number;
  unit: ProductUnit | null;
  version: number;
  active: boolean;
  note: string | null;
  /**
   * `productId`/`purchaseUnit`/`purchaseFactor`/`available` — faqat batafsil ko'rinishda (`getRecipe`): shu kodning
   * tanlangan ombordagi hujjati (bo'lmasa — foydalanuvchi doirasidagi boshqa filial nusxasi, `available: null`;
   * umuman topilmasa — `productId: null`). Texkarta tahririda `saveRecipeAction` shu id'larni oladi.
   */
  items: {
    code: string; name: string; qty: number; unit: ProductUnit | null; lossPct: number;
    productId?: string | null; purchaseUnit?: ProductUnit | null; purchaseFactor?: number | null; available?: number | null;
  }[];
  /** Faqat `getRecipe`: tayyor mahsulotning shu ombordagi (yoki doiradagi) hujjati */
  outputProductId?: string | null;
  /** `rate` — 1 birlik tayyor mahsulot uchun */
  operations: { name: string; rate: number; normMin: number | null }[];
  overheadPerUnit: number;
  /** Σ operatsiya narxlari (1 birlik uchun) */
  laborPerUnit: number;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** Faqat batafsil ko'rinishda: eski versiyalar (yangisi birinchi) */
  versions?: { version: number; changedAt: string | null; changedBy: string; outputQty: number; items: number; operations: number; overheadPerUnit: number }[];
}

/** Kod → ombordagi hujjat (getRecipe uchun): tanlangan ombordagi «omborda» → shu ombordagi istalgan → doiradagi eng eski */
export interface CodeProduct { productId: string; purchaseUnit: ProductUnit | null; purchaseFactor: number | null; available: number | null }

export function recipeView(r: RecipeDoc, opts: { withVersions?: boolean; products?: ReadonlyMap<string, CodeProduct> } = {}): RecipeView {
  const pm = opts.products;
  return {
    id: String(r._id),
    name: r.name,
    mode: r.mode ?? 'production',
    outputCode: r.outputCode,
    outputName: r.outputName,
    outputQty: r.outputQty,
    unit: r.unit ?? null,
    version: r.version ?? 1,
    active: r.active !== false,
    note: r.note || null,
    items: (r.items ?? []).map((i) => {
      const base = { code: i.code, name: i.name, qty: i.qty, unit: i.unit ?? null, lossPct: i.lossPct ?? 0 };
      if (!pm) return base;
      const p = pm.get(i.code);
      return { ...base, productId: p?.productId ?? null, purchaseUnit: p?.purchaseUnit ?? null, purchaseFactor: p?.purchaseFactor ?? null, available: p?.available ?? null };
    }),
    ...(pm ? { outputProductId: pm.get(r.outputCode)?.productId ?? null } : {}),
    operations: (r.operations ?? []).map((o) => ({ name: o.name, rate: o.rate ?? 0, normMin: o.normMin ?? null })),
    overheadPerUnit: r.overheadPerUnit ?? 0,
    laborPerUnit: (r.operations ?? []).reduce((s, o) => s + (o.rate ?? 0), 0),
    createdBy: r.createdBy,
    updatedBy: r.updatedBy ?? null,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    ...(opts.withVersions
      ? {
          versions: [...(r.prevVersions ?? [])].reverse().map((v) => ({
            version: v.version,
            changedAt: iso(v.changedAt),
            changedBy: v.changedBy,
            outputQty: v.outputQty,
            items: v.items?.length ?? 0,
            operations: v.operations?.length ?? 0,
            overheadPerUnit: v.overheadPerUnit ?? 0,
          })),
        }
      : {}),
  };
}

/* ───────────────────────────── saqlash ───────────────────────────── */

export interface RecipeInput {
  id?: string;
  name: string;
  mode?: RecipeMode;
  /** Tayyor mahsulot (istalgan filialdagi hujjat) — kodi olinadi */
  outputProductId: string;
  outputQty: number;
  items: { productId: string; qty: number; unit?: ProductUnit | null; lossPct?: number }[];
  operations?: { name: string; rate?: number; normMin?: number }[];
  overheadPerUnit?: number;
  note?: string;
  expectedVersion?: number;
}

const sameComposition = (a: IRecipeComposition, b: IRecipeComposition) =>
  JSON.stringify([a.outputQty, a.items.map((i) => [i.code, i.qty, i.unit ?? null, i.lossPct]), a.operations.map((o) => [o.name, o.rate, o.normMin ?? null]), a.overheadPerUnit])
  === JSON.stringify([b.outputQty, b.items.map((i) => [i.code, i.qty, i.unit ?? null, i.lossPct]), b.operations.map((o) => [o.name, o.rate, o.normMin ?? null]), b.overheadPerUnit]);

const countable = (p: ProductDoc) => p.kind !== 'service' && p.kind !== 'bundle' && !!p.trackQuantity;

/** Texkarta yaratish yoki o'zgartirish (`recipe.manage`) */
export async function saveRecipe(ctx: ProductionCtx, input: RecipeInput): Promise<OpResult<{ recipe: RecipeView; created: boolean; versionBumped: boolean }>> {
  const denied = guard(ctx, 'production', 'recipe.manage');
  if (denied) return denied;
  const scope = branchFilter(ctx.user);

  // Tayyor mahsulot — istalgan filialdagi hujjat (faqat kodi/nomi/birligi olinadi): u akt bilan istalgan faol omborga
  // chiqariladi (`resolveAnyBranch`), filial xodimi ham tayyor mahsulot ombori boshqa bo'lgan texkartani tahrirlay oladi
  const output = await ctx.m.Product.findOne({ _id: input.outputProductId, ...GOODS_ONLY }).lean<ProductDoc>();
  if (!output) return fail(ctx.d, 'outputNotFound');
  if (!countable(output)) return fail(ctx.d, 'notCountable', { name: output.name });

  // Xom ashyo
  const ids = [...new Set(input.items.map((i) => i.productId))];
  const products = await ctx.m.Product.find({ _id: { $in: ids }, ...scope }).lean<ProductDoc[]>();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const outputCode = await ensureItemCode(ctx.m.Product, output);
  const items: IRecipeItem[] = [];
  const seen = new Set<string>();
  for (const it of input.items) {
    const p = byId.get(it.productId);
    if (!p) return fail(ctx.d, 'productNotFound');
    if (!countable(p)) return fail(ctx.d, 'notCountable', { name: p.name });
    const factor = unitFactor(p, it.unit);
    if (factor === null) return fail(ctx.d, 'badUnit', { name: p.name });
    const qty = roundQty(it.qty * factor);
    if (!(qty > 0)) return fail(ctx.d, 'badQty', { name: p.name });
    const code = await ensureItemCode(ctx.m.Product, p);
    if (code === outputCode) return fail(ctx.d, 'selfComponent');
    if (seen.has(code)) return fail(ctx.d, 'duplicateLine', { name: p.name });
    seen.add(code);
    items.push({ code, name: p.name, qty, unit: p.unit, lossPct: Math.min(Math.max(it.lossPct ?? 0, 0), L.maxLossPct) });
  }
  const operations: IRecipeOperation[] = (input.operations ?? []).map((o) => ({
    name: o.name,
    rate: Math.max(0, Math.round(o.rate ?? 0)),
    ...(o.normMin !== undefined ? { normMin: o.normMin } : {}),
  }));
  const composition: IRecipeComposition = { outputQty: input.outputQty, items, operations, overheadPerUnit: Math.max(0, Math.round(input.overheadPerUnit ?? 0)) };
  const head = {
    name: input.name,
    mode: input.mode ?? 'production',
    outputCode,
    outputName: output.name,
    unit: output.unit,
    ...(input.note !== undefined ? { note: input.note || undefined } : {}),
  };

  if (!input.id) {
    const created = await ctx.m.Recipe.create({ ...head, ...composition, version: 1, active: true, createdBy: ctx.user.username });
    await audit(ctx, 'production', 'recipe.create', String(created._id), `Texkarta yaratildi: ${input.name} → ${output.name} (${items.length} ta xom ashyo)`);
    return ok({ recipe: recipeView(created.toObject() as RecipeDoc), created: true, versionBumped: false });
  }

  if (!validId(input.id)) return fail(ctx.d, 'recipeNotFound');
  const cur = await ctx.m.Recipe.findById(input.id).lean<RecipeDoc>();
  if (!cur) return fail(ctx.d, 'recipeNotFound');
  if (input.expectedVersion && input.expectedVersion !== cur.version) return fail(ctx.d, 'conflict');
  const bump = !sameComposition(cur, composition) || cur.outputCode !== outputCode;
  const now = new Date();
  const update = bump
    ? {
        $set: { ...head, ...composition, version: cur.version + 1, updatedBy: ctx.user.username },
        $push: {
          prevVersions: {
            $each: [{ version: cur.version, outputQty: cur.outputQty, items: cur.items, operations: cur.operations, overheadPerUnit: cur.overheadPerUnit ?? 0, changedAt: now, changedBy: ctx.user.username }],
            $slice: -L.maxRecipeVersions,
          },
        },
      }
    : { $set: { ...head, updatedBy: ctx.user.username } };
  const saved = await ctx.m.Recipe.findOneAndUpdate({ _id: cur._id, version: cur.version }, update, { new: true }).lean<RecipeDoc>();
  if (!saved) return fail(ctx.d, 'conflict');
  await audit(ctx, 'production', bump ? 'recipe.version' : 'recipe.update', String(saved._id),
    bump ? `Texkarta o'zgartirildi: ${saved.name} — versiya ${saved.version}` : `Texkarta tahrirlandi: ${saved.name}`,
    { version: saved.version });
  return ok({ recipe: recipeView(saved), created: false, versionBumped: bump });
}

/** Arxivga olish / faollashtirish (`recipe.manage`). Ochiq aktlar o'z nusxasi bilan ishlashda davom etadi */
export async function setRecipeActive(ctx: ProductionCtx, id: string, active: boolean): Promise<OpResult<{ recipe: RecipeView }>> {
  const denied = guard(ctx, 'production', 'recipe.manage');
  if (denied) return denied;
  if (!validId(id)) return fail(ctx.d, 'recipeNotFound');
  const saved = await ctx.m.Recipe.findOneAndUpdate({ _id: id }, { $set: { active, updatedBy: ctx.user.username } }, { new: true }).lean<RecipeDoc>();
  if (!saved) return fail(ctx.d, 'recipeNotFound');
  await audit(ctx, 'production', active ? 'recipe.restore' : 'recipe.archive', id, `Texkarta ${active ? 'faollashtirildi' : 'arxivga olindi'}: ${saved.name}`);
  return ok({ recipe: recipeView(saved) });
}

/* ───────────────────────────── o'qish ───────────────────────────── */

const READ_PERMS = ['production.view', 'recipe.manage', 'production.manage'] as const;

export async function listRecipes(
  ctx: ProductionCtx,
  q: { active?: boolean | 'all'; q?: string; page?: number; limit?: number } = {},
): Promise<OpResult<{ items: RecipeView[]; total: number; page: number; limit: number }>> {
  const denied = guard(ctx, 'production', READ_PERMS);
  if (denied) return denied;
  const filter: Record<string, unknown> = {};
  if (q.active !== 'all') filter.active = q.active === false ? false : { $ne: false };
  const rx = searchRegex(q.q);
  if (rx) filter.$or = [{ name: rx }, { outputName: rx }, { outputCode: rx }];
  const { skip, limit, page } = pageArgs(q);
  const [list, total] = await Promise.all([
    ctx.m.Recipe.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean<RecipeDoc[]>(),
    ctx.m.Recipe.countDocuments(filter),
  ]);
  return ok({ items: list.map((r) => recipeView(r)), total, page, limit });
}

export interface RecipeCostEstimate {
  branchId: string;
  /** 1 birlik tayyor mahsulot taxminiy tannarxi (joriy o'rtacha narxlar bilan) */
  materials: number;
  labor: number;
  overhead: number;
  total: number;
  /** Shu omborda topilmagan xom ashyo kodlari (narxi 0 deb olingan) */
  missing: string[];
}

/** Bitta texkarta (eski versiyalar bilan); `production.viewCost` bo'lsa — omborda taxminiy tannarx */
export async function getRecipe(ctx: ProductionCtx, id: string, opts: { branchId?: string } = {}): Promise<OpResult<{ recipe: RecipeView; cost: RecipeCostEstimate | null }>> {
  const denied = guard(ctx, 'production', READ_PERMS);
  if (denied) return denied;
  if (!validId(id)) return fail(ctx.d, 'recipeNotFound');
  const r = await ctx.m.Recipe.findById(id).lean<RecipeDoc>();
  if (!r) return fail(ctx.d, 'recipeNotFound');
  const b = await resolveOwnBranch(ctx, opts.branchId);
  if (!b.ok) return b;
  let cost: RecipeCostEstimate | null = null;
  if (canViewProdCost(ctx)) {
    const costs = await costByCode(ctx, r.items.map((i) => i.code), b.data);
    cost = { branchId: b.data, ...estimateUnitCost(r.items, r.outputQty, costs, r.operations, r.overheadPerUnit ?? 0) };
  }
  const [products, outputDoc] = await Promise.all([
    productsByCode(ctx, r.items.map((i) => i.code), b.data),
    productsByCode(ctx, [r.outputCode], b.data, { anyBranch: true }),
  ]);
  for (const [k, v] of outputDoc) products.set(k, v);
  return ok({ recipe: recipeView(r, { withVersions: true, products }), cost });
}

/**
 * Kodlar → mahsulot hujjati (texkarta tahriri uchun `productId`). Tartib: shu ombordagi «omborda» → shu ombordagi
 * istalgan holat → foydalanuvchi doirasidagi boshqa filial nusxasi (eng eskisi). `available` — faqat shu ombordagi
 * hujjat uchun (boshqa filial nusxasida — null). Topilmagan kod — xaritada yo'q.
 */
async function productsByCode(ctx: ProductionCtx, codes: readonly string[], branchId: string, opts: { anyBranch?: boolean } = {}): Promise<Map<string, CodeProduct>> {
  const uniq = [...new Set(codes.filter(Boolean).map((c) => c.toUpperCase()))];
  const out = new Map<string, CodeProduct>();
  if (!uniq.length) return out;
  const docs = await ctx.m.Product.find({
    ...(opts.anyBranch ? {} : branchFilter(ctx.user)),
    ...GOODS_ONLY,
    trackQuantity: true,
    $or: [{ itemCode: { $in: uniq } }, { itemCode: { $exists: false }, productId: { $in: uniq } }],
  })
    .select('itemCode productId unit purchaseUnit purchaseFactor quantity soldQuantity status branchId createdAt')
    .sort({ createdAt: 1 })
    .limit(uniq.length * 20)
    .lean<ProductDoc[]>();
  const rank = (p: ProductDoc) => (String(p.branchId) === branchId ? (p.status === 'in_stock' ? 0 : 1) : 2);
  const best = new Map<string, ProductDoc>();
  for (const p of docs) {
    const code = codeOf(p);
    if (!code) continue;
    const cur = best.get(code);
    if (!cur || rank(p) < rank(cur)) best.set(code, p);
  }
  for (const [code, p] of best) {
    const here = String(p.branchId) === branchId;
    out.set(code, {
      productId: String(p._id),
      purchaseUnit: p.purchaseUnit ?? null,
      purchaseFactor: p.purchaseFactor ?? null,
      available: here ? (p.status === 'in_stock' ? Math.max(0, roundQty((p.quantity ?? 0) - (p.soldQuantity ?? 0))) : 0) : null,
    });
  }
  return out;
}

/** Kodlar bo'yicha omborda o'rtacha kelish narxi */
async function costByCode(ctx: ProductionCtx, codes: string[], branchId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const code of codes) {
    const p = await findStockDoc(ctx.m.Product, code, branchId, { receivable: true });
    if (p) map.set(code, p.purchasePrice ?? 0);
  }
  return map;
}

export interface RequirementLine {
  code: string;
  name: string;
  unit: ProductUnit | null;
  /** Texkartada `outputQty` uchun sarf (yo'qotishsiz) */
  perBatch: number;
  lossPct: number;
  /** Sof ehtiyoj va yo'qotish bilan (yuqoriga yaxlitlangan) */
  netQty: number;
  required: number;
  /** Shu ombordagi hujjat (yo'q — null: kirim qilish kerak) */
  productId: string | null;
  available: number;
  shortage: number;
  /** `production.viewCost` bo'lmasa — null */
  unitCost: number | null;
  cost: number | null;
}

export interface Requirements {
  recipeId: string;
  recipeName: string;
  version: number;
  outputName: string;
  qty: number;
  unit: ProductUnit | null;
  branchId: string;
  lines: RequirementLine[];
  labor: { operation: string; rate: number; amount: number }[];
  /** Tannarx ko'rinmasa — null */
  totals: { materials: number; labor: number; overhead: number; total: number; perUnit: number } | null;
  /** Yetmaydigan qatorlar soni */
  shortages: number;
}

/**
 * Ehtiyoj hisobi: N birlik uchun qancha xom ashyo (yo'qotish bilan), omborda bormi, qancha yetmaydi.
 * Xarid rejasi (PO) va akt ochishdan oldingi tekshiruv uchun.
 */
export async function getRequirements(ctx: ProductionCtx, input: { recipeId: string; qty: number; branchId?: string }): Promise<OpResult<Requirements>> {
  const denied = guard(ctx, 'production', READ_PERMS);
  if (denied) return denied;
  if (!validId(input.recipeId)) return fail(ctx.d, 'recipeNotFound');
  const r = await ctx.m.Recipe.findById(input.recipeId).lean<RecipeDoc>();
  if (!r) return fail(ctx.d, 'recipeNotFound');
  const b = await resolveOwnBranch(ctx, input.branchId);
  if (!b.ok) return b;
  const showCost = canViewProdCost(ctx);
  const planned = planMaterials(r.items, input.qty, r.outputQty);
  const lines: RequirementLine[] = [];
  let materials = 0;
  for (let i = 0; i < planned.length; i++) {
    const pl = planned[i];
    const it = r.items[i];
    const p = await findStockDoc(ctx.m.Product, pl.code, b.data, { receivable: true });
    const available = p && p.status === 'in_stock' ? Math.max(0, roundQty((p.quantity ?? 0) - (p.soldQuantity ?? 0))) : 0;
    const unitCost = p?.purchasePrice ?? 0;
    const cost = Math.round(unitCost * pl.plannedQty);
    materials += cost;
    lines.push({
      code: pl.code, name: p?.name ?? pl.name, unit: (it.unit ?? null) as ProductUnit | null,
      perBatch: it.qty, lossPct: it.lossPct ?? 0, netQty: pl.netQty, required: pl.plannedQty,
      productId: p ? String(p._id) : null, available, shortage: Math.max(0, roundQty(pl.plannedQty - available)),
      unitCost: showCost ? unitCost : null, cost: showCost ? cost : null,
    });
  }
  const labor = r.operations.map((o) => ({ operation: o.name, rate: o.rate, amount: Math.round(o.rate * input.qty) }));
  const laborSum = labor.reduce((s, l) => s + l.amount, 0);
  const overhead = Math.round((r.overheadPerUnit ?? 0) * input.qty);
  const total = materials + laborSum + overhead;
  return ok({
    recipeId: String(r._id), recipeName: r.name, version: r.version, outputName: r.outputName, qty: input.qty, unit: r.unit ?? null,
    branchId: b.data, lines,
    labor,
    totals: showCost ? { materials, labor: laborSum, overhead, total, perUnit: input.qty > 0 ? Math.round(total / input.qty) : 0 } : null,
    shortages: lines.filter((l) => l.shortage > 0).length,
  });
}

