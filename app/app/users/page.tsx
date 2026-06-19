import { getTenantAdminSession, getOrgWithPlan } from '@/lib/tenantSession';
import { resolveWarehouseBranchId } from '@/lib/warehouseBranch';
import FilialManager from '@/components/tenant/FilialManager';
import Icon from '@/components/icons/Icon';

export const metadata = { title: 'Filiallar — Savora' };

export default async function UsersPage() {
  const { user, User, Branch } = await getTenantAdminSession();
  const fullOrg = user.organizationId ? await getOrgWithPlan(user.organizationId) : null;
  const maxFilial = fullOrg?.plan.maxFilial ?? 1;

  const warehouseBranchId = (await resolveWarehouseBranchId(Branch)) ?? '';
  const [branches, users] = await Promise.all([
    Branch.find().sort({ createdAt: 1 }).lean(),
    User.find({ role: 'user' }).lean(),
  ]);

  const activeBranches = branches.filter((b) => b.active).length;
  const loginByBranch = new Map(
    users.filter((u) => u.branchId).map((u) => [String(u.branchId), u.username])
  );

  // Markaziy ombor (birinchi filial) ro'yxatda ko'rsatilmaydi — uni admin boshqaradi
  const filials = branches
    .filter((b) => String(b._id) !== warehouseBranchId)
    .map((b) => ({
      branchId: String(b._id),
      name: b.name,
      address: b.address,
      phone: b.phone,
      active: b.active,
      username: loginByBranch.get(String(b._id)),
    }));

  return (
    <>
      <div className="dash-head">
        <div>
          <h1 className="dash-hello">Filiallar</h1>
          <p className="dash-sub">
            Har filialga bitta login — o&apos;sha filial xodimlari shu login bilan ishlaydi
          </p>
        </div>
      </div>

      <div className="auth-alert auth-alert--info" style={{ marginTop: 8 }}>
        <Icon name="building" size={16} /> Filial xodimlari alohida akkaunt olmaydi — hammasi
        filialning login/paroli bilan kiradi. Admin barcha filiallarni va ular bo&apos;yicha
        hisobotni ko&apos;radi.
      </div>

      <FilialManager filials={filials} maxFilial={maxFilial} activeBranchCount={activeBranches} />
    </>
  );
}
