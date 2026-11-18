import { getTenantAdminSession, getOrgWithPlan } from '@/lib/tenantSession';
import FilialManager from '@/components/tenant/FilialManager';
import { effectivePermissionsWithRole, rolePermissionList } from '@/lib/permissions';
import { ensureDefaultRoles } from '@/lib/roles';
import { resolveOrgPlan } from '@/lib/plans';
import { isStaffLogin } from '@/lib/staff';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.crm.team.metaTitle };
}

export default async function UsersPage() {
  const { user, User, Branch, Role, features, org } = await getTenantAdminSession();
  const d = await getDict();
  const fullOrg = user.organizationId ? await getOrgWithPlan(user.organizationId) : null;
  const maxFilial = fullOrg?.plan.maxFilial ?? 1;
  const maxUsers = fullOrg ? resolveOrgPlan({ plan: fullOrg.plan }).maxUsers : 1;

  await ensureDefaultRoles(Role, org.businessType);
  const [branches, users, roles] = await Promise.all([
    Branch.find().sort({ createdAt: 1 }).lean(),
    User.find().sort({ createdAt: 1 }).lean(),
    Role.find().sort({ name: 1 }).lean(),
  ]);
  const roleById = new Map(roles.map((r) => [String(r._id), r]));

  // Asosiy ombor (isMain) filial emas — sanoqqa kirmaydi
  const activeBranches = branches.filter((b) => b.active && !b.isMain).length;
  const branchById = new Map(branches.map((b) => [String(b._id), b]));
  // Filialning o'z logini — staff belgisi yo'q eng birinchi login; qolganlari xodim (eski ma'lumotda ham)
  const branchLoginOf = new Map<string, string>();
  for (const u of users) {
    if (u.role !== 'user' || !u.branchId || u.staff) continue;
    const bid = String(u.branchId);
    if (!branchLoginOf.has(bid) && !branchById.get(bid)?.isMain) branchLoginOf.set(bid, String(u._id));
  }

  // Barcha foydalanuvchilar: admin + filial loginlari + xodimlar (bitta jadvalda)
  const rows = users.map((u) => {
    const branch = u.branchId ? branchById.get(String(u.branchId)) : undefined;
    const kind: 'admin' | 'branch' | 'staff' = u.role === 'admin'
      ? 'admin'
      : isStaffLogin(u, branch) || (u.branchId && branchLoginOf.get(String(u.branchId)) !== String(u._id))
        ? 'staff'
        : 'branch';
    return {
      id: String(u._id),
      username: u.username,
      name: u.fullName || branch?.name || u.username,
      kind,
      role: u.role as 'admin' | 'user',
      active: u.active,
      createdAt: (u.createdAt ?? new Date()).toString(),
      isSelf: String(u._id) === user.id,
      // Filial tahriri uchun
      branchId: u.branchId ? String(u.branchId) : undefined,
      branchName: branch?.name,
      phone: branch?.phone ?? '',
      address: branch?.address ?? '',
      // Rol biriktirilgan bo'lsa — huquqlar roldan (lib/permissionGuard bilan bir xil qoida)
      permissions: [...effectivePermissionsWithRole(u, u.roleId ? roleById.get(String(u.roleId)) : null)],
      permissionsDefault: u.role === 'admin' || (!u.roleId && !Array.isArray(u.permissions)),
      roleId: u.roleId && roleById.has(String(u.roleId)) ? String(u.roleId) : undefined,
      roleName: u.roleId ? roleById.get(String(u.roleId))?.name : undefined,
    };
  });
  // Tartib: egasi → asosiy ombor xodimlari → har filial (o'z logini, keyin xodimlari)
  const branchOrder = new Map(branches.map((b, i) => [String(b._id), b.isMain ? -1 : i]));
  const rank = (r: (typeof rows)[number]) => (r.kind === 'admin' ? -2 : branchOrder.get(r.branchId ?? '') ?? 1e6);
  rows.sort((a, b) => rank(a) - rank(b) || (a.kind === 'branch' ? -1 : 0) - (b.kind === 'branch' ? -1 : 0));

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{d.crm.team.title}</h1>
          <p className="t-page-sub">{d.crm.team.sub}</p>
        </div>
      </div>
      <FilialManager
        rows={rows}
        maxFilial={maxFilial}
        activeBranchCount={activeBranches}
        maxUsers={maxUsers}
        activeUserCount={users.filter((u) => u.active).length}
        branches={branches.filter((b) => b.active).map((b) => ({ id: String(b._id), name: b.name, isMain: !!b.isMain }))}
        features={features}
        roles={roles.map((r) => ({ id: String(r._id), name: r.name, permissions: rolePermissionList(r) }))}
      />
    </>
  );
}
