import { getTenantAdminSession, getOrgWithPlan } from '@/lib/tenantSession';
import FilialManager from '@/components/tenant/FilialManager';
import { effectivePermissions } from '@/lib/permissions';
import { ensureDefaultRoles } from '@/lib/roles';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.crm.team.metaTitle };
}

export default async function UsersPage() {
  const { user, User, Branch, Role, features } = await getTenantAdminSession();
  const d = await getDict();
  const fullOrg = user.organizationId ? await getOrgWithPlan(user.organizationId) : null;
  const maxFilial = fullOrg?.plan.maxFilial ?? 1;

  await ensureDefaultRoles(Role);
  const [branches, users, roles] = await Promise.all([
    Branch.find().sort({ createdAt: 1 }).lean(),
    User.find().sort({ createdAt: 1 }).lean(),
    Role.find().sort({ name: 1 }).lean(),
  ]);
  const roleById = new Map(roles.map((r) => [String(r._id), r]));

  // Asosiy ombor (isMain) filial emas — sanoqqa kirmaydi
  const activeBranches = branches.filter((b) => b.active && !b.isMain).length;
  const branchById = new Map(branches.map((b) => [String(b._id), b]));

  // Barcha foydalanuvchilar: admin + filial loginlari (bitta jadvalda)
  const rows = users.map((u) => {
    const branch = u.branchId ? branchById.get(String(u.branchId)) : undefined;
    return {
      id: String(u._id),
      username: u.username,
      name: u.fullName || branch?.name || u.username,
      role: u.role as 'admin' | 'user',
      active: u.active,
      createdAt: (u.createdAt ?? new Date()).toString(),
      isSelf: String(u._id) === user.id,
      // Filial tahriri uchun
      branchId: u.branchId ? String(u.branchId) : undefined,
      phone: branch?.phone ?? '',
      address: branch?.address ?? '',
      // Rol biriktirilgan bo'lsa — huquqlar roldan (lib/permissionGuard bilan bir xil qoida)
      permissions: [...effectivePermissions({ role: u.role, permissions: (u.roleId && roleById.get(String(u.roleId))?.permissions) || u.permissions })],
      permissionsDefault: u.role === 'admin' || (!u.roleId && !Array.isArray(u.permissions)),
      roleId: u.roleId && roleById.has(String(u.roleId)) ? String(u.roleId) : undefined,
      roleName: u.roleId ? roleById.get(String(u.roleId))?.name : undefined,
    };
  });

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{d.crm.team.title}</h1>
          <p className="t-page-sub">{d.crm.team.sub}</p>
        </div>
      </div>
      <FilialManager rows={rows} maxFilial={maxFilial} activeBranchCount={activeBranches} features={features} roles={roles.map((r) => ({ id: String(r._id), name: r.name, permissions: r.permissions }))} />
    </>
  );
}
