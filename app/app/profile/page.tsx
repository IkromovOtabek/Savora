import { getTenantSession, getOrgWithPlan } from '@/lib/tenantSession';
import { resolveWarehouseBranchId } from '@/lib/warehouseBranch';
import ProfileForms from '@/components/tenant/ProfileForms';
import FilialManager from '@/components/tenant/FilialManager';

export const metadata = { title: 'Kabinet — Savora' };

export default async function ProfilePage() {
  const { user, User, Branch } = await getTenantSession();
  const dbUser = await User.findById(user.id).lean();

  const isAdmin = user.role === 'admin';

  let filials: { branchId: string; name: string; address?: string; phone?: string; active: boolean; username?: string }[] = [];
  let employees: { id: string; fullName: string; username: string; active: boolean; branchName?: string }[] = [];
  let maxFilial = 1;
  let activeBranchCount = 0;
  if (isAdmin) {
    const warehouseBranchId = (await resolveWarehouseBranchId(Branch)) ?? '';
    const [branches, users] = await Promise.all([
      Branch.find().sort({ createdAt: 1 }).lean(),
      User.find({ role: { $ne: 'admin' } }).sort({ createdAt: 1 }).lean(),
    ]);
    activeBranchCount = branches.filter((b) => b.active).length;
    const branchNameMap = Object.fromEntries(branches.map((b) => [String(b._id), b.name]));
    const userByBranch = new Map(users.filter((u) => u.branchId).map((u) => [String(u.branchId), u.username]));
    filials = branches
      .filter((b) => String(b._id) !== warehouseBranchId)
      .map((b) => ({
        branchId: String(b._id),
        name: b.name,
        address: b.address,
        phone: b.phone,
        active: b.active,
        username: userByBranch.get(String(b._id)),
      }));
    employees = users.map((u) => ({
      id: String(u._id),
      fullName: u.fullName || u.username,
      username: u.username,
      active: u.active,
      branchName: u.branchId ? branchNameMap[String(u.branchId)] : undefined,
    }));
    const fullOrg = user.organizationId ? await getOrgWithPlan(user.organizationId) : null;
    maxFilial = fullOrg?.plan.maxFilial ?? 1;
  }

  return (
    <>
      <div className="dash-head">
        <div>
          <h1 className="dash-hello">Kabinet</h1>
          <p className="dash-sub">Foydalanuvchi: <strong>{user.username}</strong> · {isAdmin ? 'Admin' : 'Filial'}</p>
        </div>
      </div>

      <ProfileForms
        username={user.username}
        fullName={dbUser?.fullName ?? ''}
        mustChangePassword={Boolean(dbUser?.mustChangePassword)}
      />

      {isAdmin && (
        <FilialManager
          filials={filials}
          employees={employees}
          maxFilial={maxFilial}
          activeBranchCount={activeBranchCount}
        />
      )}
    </>
  );
}
