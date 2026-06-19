import Link from 'next/link';
import { getTenantAdminSession, getOrgWithPlan } from '@/lib/tenantSession';
import BranchEditForm from '@/components/tenant/BranchEditForm';
import BranchCreateForm from '@/components/tenant/BranchCreateForm';
import Icon from '@/components/icons/Icon';

export const metadata = { title: 'Foydalanuvchilar — Savora' };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; branch?: string }>;
}) {
  const sp = await searchParams;
  const { user, User, Branch } = await getTenantAdminSession();
  const fullOrg = user.organizationId ? await getOrgWithPlan(user.organizationId) : null;
  const maxUsers = fullOrg?.plan.maxUsers ?? 3;
  const maxFilial = fullOrg?.plan.maxFilial ?? 1;

  const [users, branches] = await Promise.all([
    User.find().sort({ createdAt: 1 }).lean(),
    Branch.find().sort({ createdAt: 1 }).lean(),
  ]);
  const activeUsers = users.filter((u) => u.active).length;
  const activeBranches = branches.filter((b) => b.active).length;
  const canAddUser = activeUsers < maxUsers;
  const canAddBranch = activeBranches < maxFilial;

  const usersPercent = Math.min(100, Math.round((activeUsers / maxUsers) * 100));
  const branchesPercent = Math.min(100, Math.round((activeBranches / maxFilial) * 100));

  return (
    <>
      <div className="dash-head">
        <div>
          <h1 className="dash-hello">Jamoa boshqaruvi</h1>
          <p className="dash-sub">Xodimlar, rollar va filiallar — bitta joyda</p>
        </div>
        {canAddUser && (
          <Link href="/app/users/new" className="btn btn-primary btn-with-icon">
            <Icon name="plus" size={18} />
            Xodim qo&apos;shish
          </Link>
        )}
      </div>

      {sp?.created === '1' && <div className="auth-alert auth-alert--info" style={{ marginBottom: 16 }}>✓ Foydalanuvchi qo&apos;shildi.</div>}
      {sp?.branch === '1' && <div className="auth-alert auth-alert--info" style={{ marginBottom: 16 }}>✓ Filial qo&apos;shildi.</div>}

      {/* Sarhisob kartalari */}
      <div className="team-meters">
        <div className="team-meter">
          <div className="team-meter-top">
            <span className="team-meter-label"><Icon name="user" size={15} /> Xodimlar</span>
            <span className="team-meter-val">{activeUsers}<small> / {maxUsers}</small></span>
          </div>
          <div className="team-meter-bar"><div className={`team-meter-fill${usersPercent >= 100 ? ' team-meter-fill--full' : ''}`} style={{ width: `${usersPercent}%` }} /></div>
          {!canAddUser && <span className="team-meter-hint">Limit to&apos;ldi — tarifni yangilang</span>}
        </div>
        <div className="team-meter">
          <div className="team-meter-top">
            <span className="team-meter-label"><Icon name="building" size={15} /> Filiallar</span>
            <span className="team-meter-val">{activeBranches}<small> / {maxFilial}</small></span>
          </div>
          <div className="team-meter-bar"><div className={`team-meter-fill${branchesPercent >= 100 ? ' team-meter-fill--full' : ''}`} style={{ width: `${branchesPercent}%` }} /></div>
          {!canAddBranch && <span className="team-meter-hint">Limit to&apos;ldi — tarifni yangilang</span>}
        </div>
      </div>

      {/* Xodimlar kartalari */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h2>Xodimlar</h2>
          <span className="panel-sub">Faol: {activeUsers} / {maxUsers}</span>
        </div>
        <div className="user-grid">
          {users.map((u) => {
            const initials = (u.fullName || u.username).trim().slice(0, 2).toUpperCase();
            const isAdmin = u.role === 'admin';
            return (
              <Link key={String(u._id)} href={`/app/users/${u._id}`} className={`user-card${!u.active ? ' user-card--off' : ''}`}>
                <div className={`user-avatar${isAdmin ? ' user-avatar--admin' : ''}`}>
                  {initials}
                  <span className={`user-dot${u.active ? ' user-dot--on' : ''}`} />
                </div>
                <div className="user-card-body">
                  <div className="user-card-name">{u.fullName || u.username}</div>
                  <div className="user-card-login">@{u.username}</div>
                </div>
                <div className="user-card-tags">
                  <span className={`user-role${isAdmin ? ' user-role--admin' : ''}`}>
                    {isAdmin ? 'Admin' : 'Xodim'}
                  </span>
                  <span className={`user-state${u.active ? '' : ' user-state--off'}`}>
                    {u.active ? 'Faol' : 'Nofaol'}
                  </span>
                </div>
                <Icon name="arrowRight" size={16} className="user-card-arrow" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Filiallar */}
      <div className="panel" id="filial">
        <div className="panel-head">
          <h2>Filiallar</h2>
          <span className="panel-sub">Faol: {activeBranches} / {maxFilial}</span>
        </div>

        {canAddBranch && (
          <div style={{ padding: '0 24px 20px', borderBottom: '1px solid var(--border)' }}>
            <BranchCreateForm compact />
          </div>
        )}

        {branches.length === 0 ? (
          <div className="panel-empty"><p>Filial yo&apos;q. Yuqoridagi forma orqali qo&apos;shing.</p></div>
        ) : (
          <div className="branch-grid" style={{ padding: 20 }}>
            {branches.map((b) => (
              <div key={String(b._id)} className="panel branch-card">
                <div className="panel-head">
                  <div className="branch-card-title">
                    <span className="branch-icon"><Icon name="building" size={18} /></span>
                    <h2>{b.name}</h2>
                    {!b.active && <span className="badge-status badge-status--suspended">Nofaol</span>}
                  </div>
                </div>
                <div className="branch-meta">
                  {b.address && <div className="branch-meta-row"><Icon name="map" size={14} /> {b.address}</div>}
                  {b.phone && <div className="branch-meta-row"><Icon name="phone" size={14} /> {b.phone}</div>}
                </div>
                <BranchEditForm
                  branch={{
                    id: String(b._id),
                    name: b.name,
                    address: b.address ?? '',
                    phone: b.phone ?? '',
                    active: b.active,
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
