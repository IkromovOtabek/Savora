'use server';

import { isValidObjectId } from 'mongoose';
import { revalidatePath } from 'next/cache';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { userCan } from '@/lib/permissionGuard';
import { isPermissionKey, PERMISSION_KEYS, PERMISSIONS } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';

type State = { error?: string; success?: string } | null;

/** Rol huquqlari: faqat ma'lum va admin'ga xos bo'lmagan kalitlar, standart tartibda */
function cleanPermissions(raw: readonly unknown[]): string[] {
  const set = new Set(raw.filter((k) => isPermissionKey(k) && !PERMISSIONS[k].adminOnly));
  return PERMISSION_KEYS.filter((k) => set.has(k));
}

async function guard() {
  const s = await getTenantAdminSession();
  const d = await getDict();
  if (!(await userCan(s.user, 'users.manage'))) {
    return { ...s, d, denied: tr(d.catalog.permissionDeniedNamed, { label: d.catalog.permissions['users.manage'].label }) };
  }
  return { ...s, d, denied: null as string | null };
}

export async function saveRoleAction(input: { id?: string; name: string; permissions: string[] }): Promise<State> {
  const { user, Role, d, denied } = await guard();
  if (denied) return { error: denied };
  const r = d.crm.team.roles;
  const name = String(input?.name ?? '').trim().slice(0, 40);
  if (!name) return { error: r.badName };
  const permissions = cleanPermissions(Array.isArray(input?.permissions) ? input.permissions : []);
  try {
    if (input.id) {
      if (!isValidObjectId(input.id)) return { error: r.notFound };
      const res = await Role.updateOne({ _id: input.id }, { $set: { name, permissions } });
      if (!res.matchedCount) return { error: r.notFound };
    } else {
      await Role.create({ name, permissions });
    }
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return { error: r.exists };
    throw e;
  }
  await recordAudit(user, {
    action: input.id ? 'role.update' : 'role.create',
    entity: 'user',
    summary: `Rol ${input.id ? 'yangilandi' : 'yaratildi'}: ${name} — ${permissions.length} ta huquq`,
    meta: { permissions },
  });
  revalidatePath('/app/roles');
  revalidatePath('/app/users');
  return { success: tr(r.saved, { name }) };
}

export async function deleteRoleAction(id: string): Promise<State> {
  const { user, Role, User, d, denied } = await guard();
  if (denied) return { error: denied };
  const r = d.crm.team.roles;
  if (!isValidObjectId(id)) return { error: r.notFound };
  const role = await Role.findByIdAndDelete(id).lean();
  if (!role) return { error: r.notFound };
  // Biriktirilgan xodimlar shaxsiy huquqlariga qaytadi
  await User.updateMany({ roleId: role._id }, { $unset: { roleId: 1 } });
  await recordAudit(user, { action: 'role.delete', entity: 'user', summary: `Rol o'chirildi: ${role.name}` });
  revalidatePath('/app/roles');
  revalidatePath('/app/users');
  return { success: r.deleted };
}
