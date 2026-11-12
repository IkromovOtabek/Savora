import { getTenantModels } from '@/lib/tenantDb';
import { effectivePermissionsWithRole, type PermissionKey } from '@/lib/permissions';
import type { OrgFeatures } from '@/lib/featureKeys';
import { getDict } from '@/lib/i18n/server';
import OrgPermissionsMatrixForm, { type MatrixUser } from './OrgPermissionsMatrixForm';

/** Super admin: do'kon loginlari × huquqlar matritsasi (tenant bazasidan) */
export default async function OrgPermissionsMatrix({
  orgId,
  dbName,
  features,
}: {
  orgId: string;
  dbName: string;
  features: OrgFeatures;
}) {
  const d = await getDict();
  let users: MatrixUser[] = [];
  try {
    const { User, Role } = await getTenantModels(dbName);
    const [list, roles] = await Promise.all([
      User.find().select('username fullName role active permissions permVersion roleId').sort({ role: 1, createdAt: 1 }).lean(),
      Role.find().select('name permissions permVersion').lean(),
    ]);
    const roleById = new Map(roles.map((r) => [String(r._id), r]));
    users = list.map((u) => {
      const role = u.roleId ? roleById.get(String(u.roleId)) : undefined;
      return {
        id: String(u._id),
        username: u.username,
        name: u.fullName || u.username,
        role: u.role,
        active: u.active,
        isDefault: u.role === 'admin' || (!role && !Array.isArray(u.permissions)),
        roleName: role?.name,
        // Rol biriktirilgan bo'lsa — roldan (lib/permissionGuard bilan bir xil qoida)
        permissions: [...effectivePermissionsWithRole(u, role)] as PermissionKey[],
      };
    });
  } catch {
    return <div className="sa-empty">{d.superPanel.loadFailed}</div>;
  }

  if (users.length === 0) {
    return <div className="sa-empty">{d.superPanel.orgPerms.noLogins}</div>;
  }

  return <OrgPermissionsMatrixForm orgId={orgId} users={users} features={features} />;
}
