/**
 * Restoran amallari konteksti va natija turlari (server). Web server action, web JSON API va mobil API
 * bir xil `RestaurantCtx` bilan lib/restaurant/ops.ts, setup.ts, queries.ts ni chaqiradi.
 * Kontekst qurish (sessiya/mobil token) — lib/restaurant/session.ts.
 */
import type { SessionUser } from '../session';
import type { getTenantModels } from '../tenantDb';
import type { OrgFeatures } from '../features';
import type { PermissionKey } from '../permissions';
import type { Dict } from '../i18n/dict';
import { tr } from '../i18n/fmt';

export type TenantModels = Awaited<ReturnType<typeof getTenantModels>>;
export type RestaurantModels = Pick<
  TenantModels,
  'Order' | 'Table' | 'Hall' | 'KitchenStation' | 'Product' | 'Sale' | 'User' | 'Branch' | 'ShopSettings' | 'ProductCategory'
>;

export interface RestaurantCtx {
  user: SessionUser;
  orgId: string;
  /** Do'kon slug'i — QR-menyu manzili uchun */
  orgSlug: string;
  m: RestaurantModels;
  /** Amaldagi huquqlar (o'chiq modul huquqlari allaqachon kesilgan — loadUserPermissions) */
  perms: ReadonlySet<PermissionKey>;
  features: OrgFeatures;
  /** Joriy til lug'ati (mobil — uz) */
  d: Dict;
  /** Audit izohiga qo'shimcha: ' (mobil)' */
  via?: string;
}

export type RestaurantErrorCode = keyof Dict['restaurant']['errors'];

export interface OpErr {
  ok: false;
  code: RestaurantErrorCode;
  error: string;
  /** HTTP holati (API route'lar uchun) */
  status: number;
  details?: Record<string, unknown>;
}
export type OpResult<T> = { ok: true; data: T } | OpErr;

const HTTP_STATUS: Partial<Record<RestaurantErrorCode, number>> = {
  moduleOff: 403,
  noPermission: 403,
  orderNotFound: 404,
  tableNotFound: 404,
  hallNotFound: 404,
  stationNotFound: 404,
  productNotFound: 404,
  itemNotFound: 404,
  waiterNotFound: 404,
  qrUnavailable: 404,
  tableBusy: 409,
  tableNumberTaken: 409,
  conflict: 409,
  orderClosed: 409,
  orderLocked: 409,
  notPrecheck: 409,
  badTransition: 409,
  itemPaid: 409,
  hasActiveItems: 409,
  hasPayments: 409,
  hallHasTables: 409,
  tableHasOrder: 409,
  pendingItems: 409,
  stopListed: 409,
  outOfStock: 409,
  sendFailed: 409,
  rateLimited: 429,
  failed: 500,
};

export function fail(
  d: Dict,
  code: RestaurantErrorCode,
  params?: Record<string, string | number>,
  details?: Record<string, unknown>,
): OpErr {
  const msg = d.restaurant.errors[code];
  return { ok: false, code, error: params ? tr(msg, params) : msg, status: HTTP_STATUS[code] ?? 400, ...(details ? { details } : {}) };
}

export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

/** Huquq yo'q bo'lsa — xato (modul o'chiq bo'lsa ham huquq to'plamida bo'lmaydi) */
export function needPerm(ctx: Pick<RestaurantCtx, 'perms' | 'd'>, key: PermissionKey): OpErr | null {
  if (ctx.perms.has(key)) return null;
  return fail(ctx.d, 'noPermission', { label: ctx.d.catalog.permissions[key].label });
}

/** Ro'yxatdan birortasi bo'lsa yetarli */
export function needAnyPerm(ctx: Pick<RestaurantCtx, 'perms' | 'd'>, keys: readonly PermissionKey[]): OpErr | null {
  if (keys.some((k) => ctx.perms.has(k))) return null;
  return fail(ctx.d, 'noPermission', { label: ctx.d.catalog.permissions[keys[0]].label });
}

export type RestaurantFeature = 'tables' | 'kitchen' | 'qrMenu';

export function needFeature(ctx: Pick<RestaurantCtx, 'features' | 'd'>, key: RestaurantFeature): OpErr | null {
  if (ctx.features[key]) return null;
  return fail(ctx.d, 'moduleOff', { label: ctx.d.catalog.features[key].label });
}

/** Buyurtma raqami/stol bilan audit izohi */
export function orderRef(o: { orderNo: string; tableNumber?: number | null }): string {
  return o.tableNumber ? `${o.orderNo} (stol ${o.tableNumber})` : o.orderNo;
}
