import { getTenantAdminSession, getOrgWithPlan } from '@/lib/tenantSession';
import FilialManager from '@/components/tenant/FilialManager';

export const metadata = { title: 'Foydalanuvchilar — Savora' };

export default async function UsersPage() {
  const { user, User, Branch } = await getTenantAdminSession();
  const fullOrg = user.organizationId ? await getOrgWithPlan(user.organizationId) : null;
  const maxFilial = fullOrg?.plan.maxFilial ?? 1;

  const [branches, users] = await Promise.all([
    Branch.find().sort({ createdAt: 1 }).lean(),
    User.find().sort({ createdAt: 1 }).lean(),
  ]);

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
    };
  });

  return (
    <FilialManager rows={rows} maxFilial={maxFilial} activeBranchCount={activeBranches} />
  );
}
