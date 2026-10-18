import { getTenantAdminSession } from '@/lib/tenantSession';
import { ensureDefaultRoles } from '@/lib/roles';
import RoleManager from '@/components/tenant/RoleManager';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  return { title: (await getDict()).crm.team.roles.metaTitle };
}

export default async function RolesPage() {
  const { Role, User, features } = await getTenantAdminSession();
  const r = (await getDict()).crm.team.roles;
  await ensureDefaultRoles(Role);
  const [roles, counts] = await Promise.all([
    Role.find().sort({ name: 1 }).lean(),
    User.aggregate<{ _id: unknown; n: number }>([{ $match: { roleId: { $exists: true } } }, { $group: { _id: '$roleId', n: { $sum: 1 } } }]),
  ]);
  const usersBy = new Map(counts.map((c) => [String(c._id), c.n]));

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{r.title}</h1>
          <p className="t-page-sub">{r.sub}</p>
        </div>
      </div>
      <RoleManager
        features={features}
        roles={roles.map((x) => ({ id: String(x._id), name: x.name, permissions: x.permissions, users: usersBy.get(String(x._id)) ?? 0 }))}
      />
    </>
  );
}
