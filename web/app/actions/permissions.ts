'use server';

import { isValidObjectId } from 'mongoose';
import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/auth';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { getTenantModels } from '@/lib/tenantDb';
import { getMasterModels } from '@/lib/masterDb';
import { userCan } from '@/lib/permissionGuard';
import { normalizeUserPermissions, PERMISSIONS, type PermissionKey } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { getDict, type Dict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';

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
  d: Dict,
): Promise<{ ok: true; username: string; list: PermissionKey[] | undefined } | { ok: false; error: string }> {
  if (!isValidObjectId(userId)) return { ok: false, error: d.crm.team.errUserNotFound };
  const target = await User.findById(userId);
  if (!target) return { ok: false, error: d.crm.team.errUserNotFound };
  if (target.role !== 'user') return { ok: false, error: d.crm.team.errAdminAlways };

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
  const d = await getDict();
  if (!(await userCan(user, 'users.manage'))) return { error: tr(d.catalog.permissionDeniedNamed, { label: d.catalog.permissions['users.manage'].label }) };

  const userId = String(formData.get('userId') || '');
  const reset = formData.get('reset') === '1';

  // Rol biriktirish: roleId berilgan (bo'sh emas) — huquqlar roldan olinadi
  const roleId = String(formData.get('roleId') || '');
  if (roleId) {
    const { Role } = await getTenantModels(user.dbName!);
    if (!isValidObjectId(roleId) || !isValidObjectId(userId)) return { error: d.crm.team.roles.notFound };
    const role = await Role.findById(roleId).select('name').lean();
    if (!role) return { error: d.crm.team.roles.notFound };
    const target = await User.findOneAndUpdate({ _id: userId, role: 'user' }, { $set: { roleId: role._id } }).select('username').lean();
    if (!target) return { error: d.crm.team.errUserNotFound };
    await recordAudit(user, { action: 'user.role', entity: 'user', entityId: userId, summary: `Rol biriktirildi: ${target.username} — ${role.name}` });
    revalidatePath('/app/users');
    return { success: tr(d.crm.team.roles.assigned, { name: role.name }) };
  }
  // Shaxsiy sozlash — rol bog'lanishi olib tashlanadi
  if (isValidObjectId(userId)) await User.updateOne({ _id: userId, role: 'user' }, { $unset: { roleId: 1 } });

  const res = await savePermissions(User, userId, formData.getAll('perm'), reset, d);
  if (!res.ok) return { error: res.error };

  await recordAudit(user, {
    action: 'user.permissions',
    entity: 'user',
    entityId: userId,
    summary: `Huquqlar o'zgardi: ${res.username} — ${summaryOf(res.list)}`,
    meta: { permissions: res.list ?? null },
  });
  revalidatePath('/app/users');
  return { success: reset ? d.crm.team.permsReset : d.crm.team.permsSaved };
}

/**
 * Super admin — do'kon ichidagi barcha filial loginlari huquqlari matritsasini saqlaydi.
 * Forma: userId (bir nechta) + perm_<userId> (belgilangan huquqlar).
 */
export async function superUpdateOrgPermissionsAction(_prev: State, formData: FormData): Promise<State> {
  const admin = await requireSuperAdmin();
  const d = await getDict();

  const orgId = String(formData.get('orgId') || '');
  if (!orgId || !isValidObjectId(orgId)) return { error: d.crm.team.errOrgId };
  const { Organization } = await getMasterModels();
  const org = await Organization.findById(orgId).select('dbName').lean();
  if (!org) return { error: d.crm.team.errOrgNotFound };

  const { User } = await getTenantModels(org.dbName);
  const resetUser = String(formData.get('resetUser') || '');
  const userIds = [...new Set(formData.getAll('userId').map(String))];
  let saved = 0;
  for (const userId of userIds) {
    const res = await savePermissions(User, userId, formData.getAll(`perm_${userId}`), resetUser === userId, d);
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
  return { success: saved ? tr(d.crm.team.permsSavedN, { n: saved }) : d.crm.team.noBranchLogins };
}
