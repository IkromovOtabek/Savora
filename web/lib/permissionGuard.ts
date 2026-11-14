import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import type { SessionUser } from './session';
import { getTenantModels } from './tenantDb';
import { getMasterModels } from './masterDb';
import { requireOrgUser } from './auth';
import { resolveOrgFeatures, TENANT_MODULES, type OrgFeatures } from './features';
import { featureDisabledError } from './featureAction';
import {
  disabledModuleOf,
  effectivePermissionsWithRole,
  PERMISSION_KEYS,
  permissionDeniedError,
  PermissionKey,
  withEnabledModules,
} from './permissions';

type PermUser = Pick<SessionUser, 'id' | 'role' | 'dbName'>;

/**
 * Huquqlar + do'kon modullari. Modul (Super Admin / tarif) huquqdan ustun: o'chiq modulning
 * huquqlari kesiladi — do'kon egasi uchun ham, to'g'ridan-to'g'ri action/API chaqiruvida ham.
 */
async function loadPermissionContext(user: PermUser): Promise<{ perms: Set<PermissionKey>; features: OrgFeatures | null }> {
  if ((user.role !== 'admin' && user.role !== 'user') || !user.dbName) return { perms: new Set(), features: null };
  try {
    const { Organization } = await getMasterModels();
    const org = await Organization.findOne({ dbName: user.dbName }).select('plan features businessType').lean();
    if (!org) return { perms: new Set(), features: null };
    const features = resolveOrgFeatures(org);
    if (user.role === 'admin') return { perms: withEnabledModules(PERMISSION_KEYS, features), features };
    const { User, Role } = await getTenantModels(user.dbName);
    const u = await User.findById(user.id).select('role permissions permVersion roleId').lean();
    if (!u) return { perms: new Set(), features };
    // Rol biriktirilgan bo'lsa — huquqlar roldan (rol o'chirilgan bo'lsa shaxsiy ro'yxatga qaytadi)
    const role = u.roleId ? await Role.findById(u.roleId).select('permissions permVersion').lean() : null;
    return { perms: withEnabledModules(effectivePermissionsWithRole(u, role), features), features };
  } catch {
    // Xatoda — eng xavfsiz holat: huquq yo'q
    return { perms: new Set(), features: null };
  }
}

/**
 * Server tomoni huquq tekshiruvlari. Huquqlar sessiyada EMAS, har safar tenant DB'dan
 * o'qiladi — shunda egasi huquqni olib qo'ysa, darhol (qayta login'siz) kuchga kiradi.
 * O'chiq modul huquqlari natijaga kirmaydi (Super Admin modulni o'chirsa — darhol).
 */
export async function loadUserPermissions(user: PermUser): Promise<Set<PermissionKey>> {
  return (await loadPermissionContext(user)).perms;
}

export async function userCan(user: PermUser, key: PermissionKey): Promise<boolean> {
  return (await loadUserPermissions(user)).has(key);
}

/** Server action uchun: `const denied = await checkPermission(user, 'sale.cancel'); if (denied) return denied;` */
export async function checkPermission(user: PermUser, key: PermissionKey): Promise<{ error: string } | null> {
  const { perms, features } = await loadPermissionContext(user);
  if (perms.has(key)) return null;
  // Sabab — modul o'chiq bo'lsa, «modul o'chirilgan» xabari (huquq emas)
  const off = features ? disabledModuleOf(key, features) : null;
  if (off) return { error: (await featureDisabledError(off))?.error ?? permissionDeniedError(key).error };
  return permissionDeniedError(key);
}

/** void qaytaradigan action'lar uchun — huquq bo'lmasa xato tashlaydi */
export async function assertPermission(user: PermUser, key: PermissionKey): Promise<void> {
  const denied = await checkPermission(user, key);
  if (denied) throw new Error(denied.error);
}

/** Sahifa/layout uchun: huquq bo'lmasa /app/locked?p=<key> (modul o'chiq bo'lsa ?m=<modul>) ga yo'naltiradi */
export async function requirePermission(key: PermissionKey): Promise<SessionUser> {
  const user = await requireOrgUser();
  const { perms, features } = await loadPermissionContext(user);
  if (!perms.has(key)) {
    const off = features ? disabledModuleOf(key, features) : null;
    redirect(off ? `/app/locked?m=${off}` : `/app/locked?p=${encodeURIComponent(key)}`);
  }
  return user;
}

/** Mobil API: 403 javob — modul o'chiq bo'lsa modul xabari, aks holda huquq xabari */
function mobileDenied(key: PermissionKey, features: OrgFeatures | null): NextResponse {
  const off = features ? disabledModuleOf(key, features) : null;
  if (off) return NextResponse.json({ error: `${TENANT_MODULES[off].label} moduli yoqilmagan.` }, { status: 403 });
  return NextResponse.json(permissionDeniedError(key), { status: 403 });
}

/** Mobil API uchun: huquq bo'lmasa 403 javob, bo'lsa null */
export async function mobilePermissionDenied(user: PermUser, key: PermissionKey): Promise<NextResponse | null> {
  const { perms, features } = await loadPermissionContext(user);
  return perms.has(key) ? null : mobileDenied(key, features);
}

/**
 * Bitta sotuv/chekni ko'rish doirasi (Sale so'roviga qo'shiladigan filtr):
 *   «Sotuvlarni ko'rish» bo'lsa — cheklovsiz (filial cheklovi alohida qo'llanadi);
 *   faqat «Sotuv qilish» bo'lsa — o'zi qilgan sotuvlar (sotuvdan keyin chek chiqarish uchun);
 *   ikkalasi ham yo'q — null.
 */
export function saleViewScope(
  user: Pick<SessionUser, 'username'>,
  perms: ReadonlySet<PermissionKey>,
): Record<string, string> | null {
  if (perms.has('sales.view')) return {};
  if (perms.has('sale.create')) return { soldBy: user.username };
  return null;
}

/** Sahifa uchun: saleViewScope null bo'lsa /app/locked ga yo'naltiradi */
export async function requireSaleViewScope(user: SessionUser): Promise<Record<string, string>> {
  const scope = saleViewScope(user, await loadUserPermissions(user));
  if (!scope) redirect(`/app/locked?p=${encodeURIComponent('sales.view')}`);
  return scope;
}

/** Mobil API uchun: ro'yxatdagi huquqlardan BIRORTASI bo'lmasa — 403 (birinchi kalit nomi bilan) */
export async function mobilePermissionDeniedAny(
  user: PermUser,
  keys: readonly PermissionKey[],
): Promise<NextResponse | null> {
  const { perms, features } = await loadPermissionContext(user);
  if (keys.some((k) => perms.has(k))) return null;
  return mobileDenied(keys[0], features);
}
