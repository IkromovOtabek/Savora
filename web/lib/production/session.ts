/**
 * `ProductionCtx` qurish: web server action (iron-session), web JSON API (redirect'siz sessiya) va
 * mobil API (Bearer token). Huquqlar har safar tenant DB'dan o'qiladi (loadUserPermissions) —
 * o'chiq modul huquqlari allaqachon kesilgan. Restoran naqshi — lib/restaurant/session.ts.
 */
import { NextResponse } from 'next/server';
import { getTenantSession } from '../tenantSession';
import { getApiTenantContext } from '../auth';
import { authenticateMobile } from '../mobileAuth';
import { getMasterModels } from '../masterDb';
import { getTenantModels } from '../tenantDb';
import { resolveOrgFeatures } from '../features';
import { loadUserPermissions } from '../permissionGuard';
import { getDict } from '../i18n/server';
import { getDictionary } from '../i18n/dict';
import type { OpErr, OpResult, ProductionCtx } from './context';

/** Server action uchun (sessiya yo'q bo'lsa — login sahifasiga redirect, mavjud action'lar kabi) */
export async function productionCtxFromSession(): Promise<ProductionCtx> {
  const { user, org, features, ...models } = await getTenantSession();
  const [perms, d] = await Promise.all([loadUserPermissions(user), getDict()]);
  return { user, orgId: String(org._id), orgName: org.name, m: models, perms, features, d };
}

/** Web JSON API uchun: sessiya yaroqsiz bo'lsa — 401 javob */
export async function productionCtxFromApi(): Promise<ProductionCtx | NextResponse> {
  const ctx = await getApiTenantContext();
  const d = await getDict();
  if (!ctx) return NextResponse.json({ error: d.stock.export.authRequired, code: 'unauthorized' }, { status: 401 });
  const { user, org } = ctx;
  const [models, perms] = await Promise.all([getTenantModels(user.dbName!), loadUserPermissions(user)]);
  return { user, orgId: org._id, orgName: org.name, m: models, perms, features: resolveOrgFeatures(org), d };
}

/** Mobil API uchun (Bearer token; muddati tugagan do'konda yozish — 402). Xabarlar o'zbekcha (mobil API'lar kabi) */
export async function productionCtxFromMobile(req: Request): Promise<ProductionCtx | NextResponse> {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.dbName || !auth.organizationId) return NextResponse.json({ error: 'Avtorizatsiya kerak.', code: 'unauthorized' }, { status: 401 });
  const { Organization } = await getMasterModels();
  const org = await Organization.findById(auth.organizationId).select('name plan features businessType').lean();
  if (!org) return NextResponse.json({ error: 'Avtorizatsiya kerak.', code: 'unauthorized' }, { status: 401 });
  const [models, perms] = await Promise.all([getTenantModels(auth.dbName), loadUserPermissions(auth)]);
  return {
    user: auth,
    orgId: String(org._id),
    orgName: org.name,
    m: models,
    perms,
    features: resolveOrgFeatures(org),
    d: getDictionary('uz'),
    via: ' (mobil)',
  };
}

/** OpResult → JSON javob: muvaffaqiyat — `data` o'zi (200/201), xato — `{ error, code, details? }` + HTTP holati */
export function toResponse<T>(r: OpResult<T>, okStatus = 200): NextResponse {
  if (r.ok) return NextResponse.json(r.data, { status: okStatus });
  return errorResponse(r);
}

export function errorResponse(e: OpErr): NextResponse {
  return NextResponse.json({ error: e.error, code: e.code, ...(e.details ? { details: e.details } : {}) }, { status: e.status });
}

/** Server action natijasi: `{ ok, data, success? }` yoki `{ ok: false, error, code, details? }` (useToastOnState bilan mos) */
export type ActionResult<T> =
  | { ok: true; data: T; success?: string; error?: undefined }
  | { ok: false; error: string; code: string; details?: Record<string, unknown>; success?: undefined };

export function toAction<T>(r: OpResult<T>, success?: string): ActionResult<T> {
  if (r.ok) return { ok: true, data: r.data, ...(success ? { success } : {}) };
  return { ok: false, error: r.error, code: r.code, ...(r.details ? { details: r.details } : {}) };
}
