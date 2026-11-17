/**
 * Ishlab chiqarish va kirim amallari konteksti va natija turlari (server). Web server action, web JSON API va
 * mobil API bir xil `ProductionCtx` bilan lib/production/* ni chaqiradi (restoran naqshi — lib/restaurant/context.ts).
 * Kontekst qurish (sessiya/mobil token) — lib/production/session.ts.
 */
import type { SessionUser } from '../session';
import type { getTenantModels } from '../tenantDb';
import type { OrgFeatures } from '../features';
import type { PermissionKey } from '../permissions';
import type { Dict } from '../i18n/dict';
import { tr } from '../i18n/fmt';
import { isBranchScoped } from '../branchScope';

export type TenantModels = Awaited<ReturnType<typeof getTenantModels>>;
export type ProductionModels = Pick<
  TenantModels,
  | 'Product' | 'Branch' | 'User' | 'Supplier' | 'SupplierEntry' | 'StockAdjustment' | 'CashFlow' | 'FinanceCategory'
  | 'Recipe' | 'ProductionOrder' | 'GoodsReceipt' | 'PurchaseOrder' | 'PieceworkEntry'
>;

export interface ProductionCtx {
  user: SessionUser;
  orgId: string;
  /** Do'kon nomi — nakladnoy (chop etish) uchun */
  orgName: string;
  m: ProductionModels;
  /** Amaldagi huquqlar (o'chiq modul huquqlari allaqachon kesilgan — loadUserPermissions) */
  perms: ReadonlySet<PermissionKey>;
  features: OrgFeatures;
  /** Joriy til lug'ati (mobil — uz) */
  d: Dict;
  /** Audit izohiga qo'shimcha: ' (mobil)' */
  via?: string;
}

export type ProductionErrorCode = keyof Dict['production']['errors'];

export interface OpErr {
  ok: false;
  code: ProductionErrorCode;
  error: string;
  /** HTTP holati (API route'lar uchun) */
  status: number;
  details?: Record<string, unknown>;
}
export type OpResult<T> = { ok: true; data: T } | OpErr;

const HTTP_STATUS: Partial<Record<ProductionErrorCode, number>> = {
  moduleOff: 403,
  noPermission: 403,
  recipeNotFound: 404,
  orderNotFound: 404,
  receiptNotFound: 404,
  poNotFound: 404,
  productNotFound: 404,
  outputNotFound: 404,
  supplierNotFound: 404,
  workerNotFound: 404,
  entryNotFound: 404,
  recipeInactive: 409,
  materialMissing: 409,
  notCountable: 409,
  notReceivable: 409,
  outOfStock: 409,
  pricesRequired: 409,
  badTransition: 409,
  conflict: 409,
  locked: 409,
  poClosed: 409,
  poMismatch: 409,
  nothingToPay: 409,
  failed: 500,
};

export function fail(
  d: Dict,
  code: ProductionErrorCode,
  params?: Record<string, string | number>,
  details?: Record<string, unknown>,
): OpErr {
  const msg = d.production.errors[code];
  return { ok: false, code, error: params ? tr(msg, params) : msg, status: HTTP_STATUS[code] ?? 400, ...(details ? { details } : {}) };
}

export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

/** Huquq yo'q bo'lsa — xato (modul o'chiq bo'lsa ham huquq to'plamida bo'lmaydi) */
export function needPerm(ctx: Pick<ProductionCtx, 'perms' | 'd'>, key: PermissionKey): OpErr | null {
  if (ctx.perms.has(key)) return null;
  return fail(ctx.d, 'noPermission', { label: ctx.d.catalog.permissions[key].label });
}

/** Ro'yxatdan birortasi bo'lsa yetarli */
export function needAnyPerm(ctx: Pick<ProductionCtx, 'perms' | 'd'>, keys: readonly PermissionKey[]): OpErr | null {
  if (keys.some((k) => ctx.perms.has(k))) return null;
  return fail(ctx.d, 'noPermission', { label: ctx.d.catalog.permissions[keys[0]].label });
}

export type ProductionFeature = 'production' | 'purchasing' | 'piecework';

export function needFeature(ctx: Pick<ProductionCtx, 'features' | 'd'>, key: ProductionFeature): OpErr | null {
  if (ctx.features[key]) return null;
  return fail(ctx.d, 'moduleOff', { label: ctx.d.catalog.features[key].label });
}

/** Modul + huquq (birinchi xato qaytadi) */
export function guard(ctx: ProductionCtx, feature: ProductionFeature, perm: PermissionKey | readonly PermissionKey[]): OpErr | null {
  return needFeature(ctx, feature) ?? (typeof perm === 'string' ? needPerm(ctx, perm) : needAnyPerm(ctx, perm));
}

/** Kelish narxi (kirim/xarid narxlari, mahsulot tannarxi) ko'rinadimi */
export const canViewPrices = (ctx: Pick<ProductionCtx, 'perms'>): boolean => ctx.perms.has('product.viewCost');
/** Ishlab chiqarish tannarxi ko'rinadimi */
export const canViewProdCost = (ctx: Pick<ProductionCtx, 'perms'>): boolean => ctx.perms.has('production.viewCost');

/** Filial xodimi (o'z filiali bilan cheklangan) */
export const scoped = (ctx: Pick<ProductionCtx, 'user'>): boolean => isBranchScoped(ctx.user);

/** 24 hex ObjectId satri */
export const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

export const iso = (d?: Date | string | null): string | null => (d ? new Date(d).toISOString() : null);
