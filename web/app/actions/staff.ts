'use server';

import { revalidatePath } from 'next/cache';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { checkPermission } from '@/lib/permissionGuard';
import { createStaff, deleteStaff, updateStaff } from '@/lib/staff';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { logError } from '@/lib/logger';

type State = { error?: string; success?: string } | null;

/**
 * Xodimlar (bir filialga bir nechta login) — /app/users. Mantiq: lib/staff.ts (mobil API bilan umumiy).
 * Faqat do'kon egasi + «users.manage»; «Jamoa» moduli o'chiq bo'lsa ham action bloklanadi (filials.ts kabi).
 */
export async function createStaffAction(_prev: State, formData: FormData): Promise<State> {
  const { user, org, User, Branch, Role, Order, Sale } = await getTenantAdminSession();
  { const denied = await checkPermission(user, 'users.manage'); if (denied) return denied; }
  const d = await getDict();
  try {
    const r = await createStaff({ User, Branch, Role, Order, Sale }, org, user, {
      branchId: String(formData.get('branchId') || ''),
      fullName: String(formData.get('fullName') || ''),
      username: String(formData.get('username') || ''),
      password: String(formData.get('password') || ''),
      roleId: String(formData.get('roleId') || ''),
    }, d);
    if (!r.ok) return { error: r.error };
    revalidatePath('/app/users');
    return { success: tr(d.crm.team.staff.created, { name: r.data.fullName, username: r.data.username }) };
  } catch (e) {
    logError('createStaffAction failed', e);
    return { error: d.crm.team.errCreate };
  }
}

export async function updateStaffAction(_prev: State, formData: FormData): Promise<State> {
  const { user, org, User, Branch, Role, Order, Sale } = await getTenantAdminSession();
  { const denied = await checkPermission(user, 'users.manage'); if (denied) return denied; }
  const d = await getDict();
  try {
    const r = await updateStaff({ User, Branch, Role, Order, Sale }, org, user, {
      userId: String(formData.get('userId') || ''),
      fullName: String(formData.get('fullName') ?? ''),
      branchId: String(formData.get('branchId') || ''),
      active: formData.get('active') === 'on',
      newPassword: String(formData.get('newPassword') || ''),
    }, d);
    if (!r.ok) return { error: r.error };
    revalidatePath('/app/users');
    return { success: d.crm.team.staff.saved };
  } catch (e) {
    logError('updateStaffAction failed', e);
    return { error: d.restaurant.errors.failed };
  }
}

export async function deleteStaffAction(_prev: State, formData: FormData): Promise<State> {
  const { user, User, Branch, Role, Order, Sale } = await getTenantAdminSession();
  { const denied = await checkPermission(user, 'users.manage'); if (denied) return denied; }
  const d = await getDict();
  try {
    const r = await deleteStaff({ User, Branch, Role, Order, Sale }, user, String(formData.get('userId') || ''), d);
    if (!r.ok) return { error: r.error };
    revalidatePath('/app/users');
    return { success: d.crm.team.staff.deleted };
  } catch (e) {
    logError('deleteStaffAction failed', e);
    return { error: d.restaurant.errors.failed };
  }
}
