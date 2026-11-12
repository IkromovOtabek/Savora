import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import type { SessionUser } from './session';
import { getTenantModels } from './tenantDb';
import { requireOrgUser } from './auth';
import {
  effectivePermissionsWithRole,
  PERMISSION_KEYS,
  permissionDeniedError,
  PermissionKey,
} from './permissions';

/**
 * Server tomoni huquq tekshiruvlari. Huquqlar sessiyada EMAS, har safar tenant DB'dan
 * o'qiladi — shunda egasi huquqni olib qo'ysa, darhol (qayta login'siz) kuchga kiradi.
 */
export async function loadUserPermissions(
  user: Pick<SessionUser, 'id' | 'role' | 'dbName'>,
): Promise<Set<PermissionKey>> {
  if (user.role === 'admin') return new Set(PERMISSION_KEYS);
  if (user.role !== 'user' || !user.dbName) return new Set();
  try {
    const { User, Role } = await getTenantModels(user.dbName);
    const u = await User.findById(user.id).select('role permissions permVersion roleId').lean();
    if (!u) return new Set();
    // Rol biriktirilgan bo'lsa — huquqlar roldan (rol o'chirilgan bo'lsa shaxsiy ro'yxatga qaytadi)
    const role = u.roleId ? await Role.findById(u.roleId).select('permissions permVersion').lean() : null;
    return effectivePermissionsWithRole(u, role);
  } catch {
    // Xatoda — eng xavfsiz holat: huquq yo'q
    return new Set();
  }
}

export async function userCan(
  user: Pick<SessionUser, 'id' | 'role' | 'dbName'>,
  key: PermissionKey,
): Promise<boolean> {
  return (await loadUserPermissions(user)).has(key);
}

/** Server action uchun: `const denied = await checkPermission(user, 'sale.cancel'); if (denied) return denied;` */
export async function checkPermission(
  user: Pick<SessionUser, 'id' | 'role' | 'dbName'>,
  key: PermissionKey,
): Promise<{ error: string } | null> {
  return (await userCan(user, key)) ? null : permissionDeniedError(key);
}

/** void qaytaradigan action'lar uchun — huquq bo'lmasa xato tashlaydi */
export async function assertPermission(
  user: Pick<SessionUser, 'id' | 'role' | 'dbName'>,
  key: PermissionKey,
): Promise<void> {
  const denied = await checkPermission(user, key);
  if (denied) throw new Error(denied.error);
}

/** Sahifa/layout uchun: huquq bo'lmasa /app/locked?p=<key> ga yo'naltiradi */
export async function requirePermission(key: PermissionKey): Promise<SessionUser> {
  const user = await requireOrgUser();
  if (!(await userCan(user, key))) redirect(`/app/locked?p=${encodeURIComponent(key)}`);
  return user;
}

/** Mobil API uchun: huquq bo'lmasa 403 javob, bo'lsa null */
export async function mobilePermissionDenied(
  user: Pick<SessionUser, 'id' | 'role' | 'dbName'>,
  key: PermissionKey,
): Promise<NextResponse | null> {
  if (await userCan(user, key)) return null;
  return NextResponse.json(permissionDeniedError(key), { status: 403 });
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
  user: Pick<SessionUser, 'id' | 'role' | 'dbName'>,
  keys: readonly PermissionKey[],
): Promise<NextResponse | null> {
  const perms = await loadUserPermissions(user);
  if (keys.some((k) => perms.has(k))) return null;
  return NextResponse.json(permissionDeniedError(keys[0]), { status: 403 });
}
