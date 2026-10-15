'use server';

import { isValidObjectId } from 'mongoose';
import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/auth';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { getTenantModels } from '@/lib/tenantDb';
import { getMasterModels } from '@/lib/masterDb';
import { checkPermission } from '@/lib/permissionGuard';
import { normalizeUserPermissions, PERMISSIONS, type PermissionKey } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';

type State = { error?: string; success?: string } | null;

type TenantUserModel = Awaited<ReturnType<typeof getTenantModels>>['User'];

/**
 * Bitta filial-login huquqlarini saqlaydi. Admin (do'kon egasi) huquqlari o'zgarmaydi —
 * u doim hammasiga ega. Natija rol standartiga teng bo'lsa — maydon tozalanadi.
 */
async function savePermissions(
  User: TenantUserModel,
  userId: string,
  raw: readonly unknown[],
  reset: boolean,
): Promise<{ ok: true; username: string; list: PermissionKey[] | undefined } | { ok: false; error: string }> {
  if (!isValidObjectId(userId)) return { ok: false, error: 'Foydalanuvchi topilmadi.' };
  const target = await User.findById(userId);
  if (!target) return { ok: false, error: 'Foydalanuvchi topilmadi.' };
  if (target.role !== 'user') return { ok: false, error: 'Do\'kon egasi (admin) doim barcha huquqlarga ega.' };

  const list = reset ? undefined : normalizeUserPermissions(raw);
  target.set('permissions', list);
  await target.save();
  return { ok: true, username: target.username, list };
}

function summaryOf(list: PermissionKey[] | undefined): string {
  if (!list) return 'rol standarti';
  if (list.length === 0) return 'hech qanday huquq';
  return list.map((k) => PERMISSIONS[k].label).join(', ');
}

/** Do'kon egasi — filial login huquqlarini o'zgartiradi (/app/users) */
export async function updateUserPermissionsAction(_prev: State, formData: FormData): Promise<State> {
  const { user, User } = await getTenantAdminSession();
  { const denied = await checkPermission(user, 'users.manage'); if (denied) return denied; }

  const userId = String(formData.get('userId') || '');
  const reset = formData.get('reset') === '1';
  const res = await savePermissions(User, userId, formData.getAll('perm'), reset);
  if (!res.ok) return { error: res.error };

  await recordAudit(user, {
    action: 'user.permissions',
    entity: 'user',
    entityId: userId,
    summary: `Huquqlar o'zgardi: ${res.username} — ${summaryOf(res.list)}`,
    meta: { permissions: res.list ?? null },
  });
  revalidatePath('/app/users');
  return { success: reset ? 'Huquqlar standartga qaytarildi.' : 'Huquqlar saqlandi.' };
}

/**
 * Super admin — do'kon ichidagi barcha filial loginlari huquqlari matritsasini saqlaydi.
 * Forma: userId (bir nechta) + perm_<userId> (belgilangan huquqlar).
 */
export async function superUpdateOrgPermissionsAction(_prev: State, formData: FormData): Promise<State> {
  const admin = await requireSuperAdmin();

  const orgId = String(formData.get('orgId') || '');
  if (!orgId || !isValidObjectId(orgId)) return { error: 'Do\'kon ID noto\'g\'ri.' };
  const { Organization } = await getMasterModels();
  const org = await Organization.findById(orgId).select('dbName').lean();
  if (!org) return { error: 'Do\'kon topilmadi.' };

  const { User } = await getTenantModels(org.dbName);
  const resetUser = String(formData.get('resetUser') || '');
  const userIds = [...new Set(formData.getAll('userId').map(String))];
  let saved = 0;
  for (const userId of userIds) {
    const res = await savePermissions(User, userId, formData.getAll(`perm_${userId}`), resetUser === userId);
    if (!res.ok) return { error: res.error };
    saved++;
    await recordAudit(
      { username: `platforma:${admin.username}`, role: 'super_admin', dbName: org.dbName },
      {
        action: 'user.permissions',
        entity: 'user',
        entityId: userId,
        summary: `Platforma huquqlarni o'zgartirdi: ${res.username} — ${summaryOf(res.list)}`,
        meta: { permissions: res.list ?? null },
      },
    );
  }

  revalidatePath(`/super/organizations/${orgId}`);
  return { success: saved ? `${saved} ta login huquqlari saqlandi.` : 'Saqlanadigan filial login yo\'q.' };
}
