import { getTenantModels } from '@/lib/tenantDb';
import { effectivePermissions, type PermissionKey } from '@/lib/permissions';
import type { OrgFeatures } from '@/lib/featureKeys';
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
  let users: MatrixUser[] = [];
  try {
    const { User } = await getTenantModels(dbName);
    const list = await User.find().select('username fullName role active permissions').sort({ role: 1, createdAt: 1 }).lean();
    users = list.map((u) => ({
      id: String(u._id),
      username: u.username,
      name: u.fullName || u.username,
      role: u.role,
      active: u.active,
      isDefault: u.role === 'admin' || !Array.isArray(u.permissions),
      permissions: [...effectivePermissions({ role: u.role, permissions: u.permissions })] as PermissionKey[],
    }));
  } catch {
    return <div className="panel-empty"><p>Ma&apos;lumotlarni yuklab bo&apos;lmadi.</p></div>;
  }

  if (users.length === 0) {
    return <div className="panel-empty"><p>Login yo&apos;q.</p></div>;
  }

  return <OrgPermissionsMatrixForm orgId={orgId} users={users} features={features} />;
}
