/**
 * Ishlab chiqarish/kirim UI yordamchilari (server, DB): mahsulot tanlash ro'yxati, minimal qoldiq, mahsulotning
 * ombor sozlamalari (xarid birligi, koeffitsient, minimal qoldiq), modul meta-ma'lumoti. Hujjat: docs/SEX_API.md §9.
 */
import type { ProductDoc } from '../models/tenant/Product';
import type { ProductUnit } from '../businessTypes';
import { PRODUCT_UNITS } from '../businessTypes';
import { branchFilter } from '../branchScope';
import { QTY_DECIMALS, roundQty } from '../qty';
import { isBelowMin, isValidFactor } from './calc';
import { codeOf, codeFilter, GOODS_ONLY, RECEIVABLE_STATUSES } from './stock';
import { audit, branchesFor, oid, resolveOwnBranch, searchRegex } from './common';
import { canViewPrices, canViewProdCost, fail, needAnyPerm, ok, scoped, validId, type OpResult, type ProductionCtx } from './context';

export interface ProductOption {
  id: string;
  code: string | null;
  name: string;
  unit: ProductUnit | null;
  purchaseUnit: ProductUnit | null;
  purchaseFactor: number | null;
  /** Shu ombordagi qoldiq (asosiy birlikda) */
  available: number;
  minStock: number | null;
  /** `product.viewCost` bo'lmasa — null */
  cost: number | null;
  salePrice: number;
  barcode: string | null;
}

const toOption = (p: ProductDoc, prices: boolean): ProductOption => ({
  id: String(p._id),
  code: codeOf(p),
  name: p.name,
  unit: p.unit ?? null,
  purchaseUnit: p.purchaseUnit ?? null,
  purchaseFactor: p.purchaseFactor ?? null,
  available: p.status === 'in_stock' ? Math.max(0, roundQty((p.quantity ?? 0) - (p.soldQuantity ?? 0))) : 0,
  minStock: p.minStock ?? null,
  cost: prices ? p.purchasePrice ?? 0 : null,
  salePrice: p.salePrice ?? 0,
  barcode: p.barcode ?? null,
});

/**
 * Tanlash ro'yxati (texkarta, akt, kirim, xarid qatorlari): shu ombordagi sanaladigan tovarlar (tugaganlari ham —
 * kirim uchun). Qidiruv: nom, kod, shtrix-kod. Ko'pi bilan 50.
 */
export async function productOptions(ctx: ProductionCtx, q: { branchId?: string; q?: string; limit?: number } = {}): Promise<OpResult<{ branchId: string; items: ProductOption[] }>> {
  const denied = needAnyPerm(ctx, ['products.view', 'recipe.manage', 'production.manage', 'receipt.create', 'po.manage']);
  if (denied) return denied;
  if (!ctx.features.production && !ctx.features.purchasing) return fail(ctx.d, 'moduleOff', { label: ctx.d.catalog.features.production.label });
  const b = await resolveOwnBranch(ctx, q.branchId);
  if (!b.ok) return b;
  const filter: Record<string, unknown> = {
    branchId: oid(b.data), ...GOODS_ONLY, trackQuantity: true, status: { $in: RECEIVABLE_STATUSES }, systemKey: { $exists: false },
  };
  const rx = searchRegex(q.q);
  if (rx) filter.$or = [{ name: rx }, { itemCode: rx }, { productId: rx }, { barcode: rx }];
  const list = await ctx.m.Product.find(filter).sort({ name: 1 }).limit(Math.min(q.limit ?? 50, 50)).lean<ProductDoc[]>();
  const prices = canViewPrices(ctx) || canViewProdCost(ctx);
  return ok({ branchId: b.data, items: list.map((p) => toOption(p, prices)) });
}

/** Minimal qoldiqdan kam mahsulotlar (filial xodimi — o'z filiali; admin — `branchId` yoki hammasi) */
export async function lowStockList(ctx: ProductionCtx, q: { branchId?: string } = {}): Promise<OpResult<{ items: (ProductOption & { branchId: string; shortage: number })[] }>> {
  const denied = needAnyPerm(ctx, ['products.view', 'receipt.create', 'po.manage']);
  if (denied) return denied;
  if (!ctx.features.production && !ctx.features.purchasing) return fail(ctx.d, 'moduleOff', { label: ctx.d.catalog.features.purchasing.label });
  const filter: Record<string, unknown> = { ...lowStockFilter(), ...branchFilter(ctx.user) };
  if (q.branchId && validId(q.branchId) && !scoped(ctx)) filter.branchId = oid(q.branchId);
  const list = await ctx.m.Product.find(filter).sort({ name: 1 }).limit(500).lean<ProductDoc[]>();
  const prices = canViewPrices(ctx);
  return ok({
    items: list.map((p) => {
      const o = toOption(p, prices);
      return { ...o, branchId: String(p.branchId), shortage: Math.max(0, roundQty((p.minStock ?? 0) - o.available)) };
    }).filter((x) => isBelowMin(x.available, x.minStock)),
  });
}

/** Minimal qoldiqdan kam (DB filtri): sanaladigan tovar, minStock > 0, qoldiq < minStock */
export function lowStockFilter(): Record<string, unknown> {
  return {
    ...GOODS_ONLY,
    trackQuantity: true,
    minStock: { $gt: 0 },
    status: { $in: RECEIVABLE_STATUSES },
    $expr: {
      $lt: [
        { $cond: [{ $eq: ['$status', 'in_stock'] }, { $round: [{ $subtract: ['$quantity', '$soldQuantity'] }, QTY_DECIMALS] }, 0] },
        '$minStock',
      ],
    },
  };
}

export interface StockSettingsInput {
  productId: string;
  /** null — olib tashlash */
  minStock?: number | null;
  /** null — olib tashlash (koeffitsient ham) */
  purchaseUnit?: ProductUnit | null;
  purchaseFactor?: number | null;
}

/**
 * Mahsulotning ombor sozlamalari (`product.edit`): minimal qoldiq — shu filialdagi hujjatga; xarid birligi va
 * koeffitsient — tovar xususiyati, admin uchun shu kodli barcha filial nusxalariga ham (filial xodimi — faqat o'ziniki).
 */
export async function setStockSettings(ctx: ProductionCtx, input: StockSettingsInput): Promise<OpResult<{ product: ProductOption; updatedCopies: number }>> {
  if (!ctx.features.products) return fail(ctx.d, 'moduleOff', { label: ctx.d.catalog.features.products.label });
  const denied = needAnyPerm(ctx, ['product.edit']);
  if (denied) return denied;
  if (!validId(input.productId)) return fail(ctx.d, 'productNotFound');
  const p = await ctx.m.Product.findOne({ _id: input.productId, ...branchFilter(ctx.user), ...GOODS_ONLY }).lean<ProductDoc>();
  if (!p) return fail(ctx.d, 'productNotFound');
  if (!p.trackQuantity) return fail(ctx.d, 'notCountable', { name: p.name });

  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  if (input.minStock !== undefined) {
    if (input.minStock === null || input.minStock === 0) unset.minStock = 1;
    else set.minStock = roundQty(input.minStock);
  }
  const unitSet: Record<string, unknown> = {};
  const unitUnset: Record<string, 1> = {};
  if (input.purchaseUnit !== undefined || input.purchaseFactor !== undefined) {
    const unit = input.purchaseUnit === undefined ? p.purchaseUnit ?? null : input.purchaseUnit;
    const factor = input.purchaseFactor === undefined ? p.purchaseFactor ?? null : input.purchaseFactor;
    if (unit === null) {
      Object.assign(unitUnset, { purchaseUnit: 1, purchaseFactor: 1 });
    } else {
      if (!(PRODUCT_UNITS as readonly string[]).includes(unit) || unit === (p.unit ?? 'dona')) return fail(ctx.d, 'badUnit', { name: p.name });
      if (!isValidFactor(factor) || factor === 1) return fail(ctx.d, 'badFactor');
      Object.assign(unitSet, { purchaseUnit: unit, purchaseFactor: factor });
    }
  }
  const update = (s: Record<string, unknown>, u: Record<string, 1>) => ({ ...(Object.keys(s).length ? { $set: s } : {}), ...(Object.keys(u).length ? { $unset: u } : {}) });
  const own = update({ ...set, ...unitSet }, { ...unset, ...unitUnset });
  if (Object.keys(own).length) await ctx.m.Product.updateOne({ _id: p._id }, own);
  let updatedCopies = 0;
  const code = codeOf(p);
  if (code && !scoped(ctx) && (Object.keys(unitSet).length || Object.keys(unitUnset).length)) {
    const r = await ctx.m.Product.updateMany({ _id: { $ne: p._id }, ...codeFilter(code), ...GOODS_ONLY }, update(unitSet, unitUnset));
    updatedCopies = r.modifiedCount;
  }
  const fresh = await ctx.m.Product.findById(p._id).lean<ProductDoc>();
  await audit(ctx, 'product', 'product.stockSettings', String(p._id),
    `Ombor sozlamasi: ${p.name}${set.minStock !== undefined ? ` · min ${set.minStock}` : unset.minStock ? ' · min olib tashlandi' : ''}${unitSet.purchaseUnit ? ` · 1 ${unitSet.purchaseUnit} = ${unitSet.purchaseFactor} ${p.unit ?? 'dona'}` : unitUnset.purchaseUnit ? ' · xarid birligi olib tashlandi' : ''}`,
    { ...set, ...unitSet, updatedCopies });
  return ok({ product: toOption(fresh ?? p, canViewPrices(ctx)), updatedCopies });
}

export interface ProductionMeta {
  features: { production: boolean; purchasing: boolean; piecework: boolean };
  branches: { id: string; name: string; isMain: boolean }[];
  /** Admin uchun standart (asosiy ombor), filial xodimi — o'z filiali */
  defaultBranchId: string;
  units: readonly ProductUnit[];
  can: {
    viewProduction: boolean; manageProduction: boolean; manageRecipes: boolean; viewCost: boolean; viewPrices: boolean;
    receive: boolean; managePo: boolean; logPiecework: boolean; approvePiecework: boolean; supplierPayment: boolean; editProducts: boolean;
  };
}

/** UI uchun bitta so'rovda: modullar, filiallar, birliklar, huquq bayroqlari */
export async function productionMeta(ctx: ProductionCtx): Promise<OpResult<ProductionMeta>> {
  const f = ctx.features;
  if (!f.production && !f.purchasing && !f.piecework) return fail(ctx.d, 'moduleOff', { label: ctx.d.catalog.features.production.label });
  const b = await resolveOwnBranch(ctx);
  if (!b.ok) return b;
  const has = (k: Parameters<ProductionCtx['perms']['has']>[0]) => ctx.perms.has(k);
  return ok({
    features: { production: f.production, purchasing: f.purchasing, piecework: f.piecework },
    branches: await branchesFor(ctx),
    defaultBranchId: b.data,
    units: PRODUCT_UNITS,
    can: {
      viewProduction: has('production.view') || has('production.manage'),
      manageProduction: has('production.manage'),
      manageRecipes: has('recipe.manage'),
      viewCost: has('production.viewCost'),
      viewPrices: has('product.viewCost'),
      receive: has('receipt.create'),
      managePo: has('po.manage'),
      logPiecework: has('piecework.log'),
      approvePiecework: has('piecework.approve'),
      supplierPayment: has('suppliers.manage') && has('product.viewCost'),
      editProducts: has('product.edit'),
    },
  });
}
