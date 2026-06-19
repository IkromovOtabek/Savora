import { getTenantModels } from '@/lib/tenantDb';

/** Biznesning tenant bazasidan xodimlar va filiallarni ko'rsatadi (faqat ko'rish) */
export default async function OrgTenantSummary({ dbName }: { dbName: string }) {
  let users: { username: string; fullName?: string; role: string; active: boolean }[] = [];
  let branches: { name: string; address?: string; phone?: string; active: boolean }[] = [];
  let failed = false;

  try {
    const { User, Branch } = await getTenantModels(dbName);
    const [u, b] = await Promise.all([
      User.find().sort({ createdAt: 1 }).lean(),
      Branch.find().sort({ createdAt: 1 }).lean(),
    ]);
    users = u.map((x) => ({ username: x.username, fullName: x.fullName, role: x.role, active: x.active }));
    branches = b.map((x) => ({ name: x.name, address: x.address, phone: x.phone, active: x.active }));
  } catch {
    failed = true;
  }

  if (failed) {
    return <div className="panel-empty"><p>Ma&apos;lumotlarni yuklab bo&apos;lmadi.</p></div>;
  }

  return (
    <div className="org-tenant-summary">
      <div className="org-tenant-block">
        <h3 className="org-tenant-title">Xodimlar <span>({users.length})</span></h3>
        {users.length === 0 ? (
          <p className="org-tenant-empty">Xodim yo&apos;q.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table data-table--simple">
              <thead><tr><th>Login</th><th>Ism</th><th>Rol</th><th>Holat</th></tr></thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={i}>
                    <td className="cell-main">{u.username}</td>
                    <td>{u.fullName ?? '—'}</td>
                    <td>{u.role === 'admin' ? 'Admin' : 'Xodim'}</td>
                    <td><span className={`badge-status badge-status--${u.active ? 'active' : 'expired'}`}>{u.active ? 'Faol' : 'Nofaol'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="org-tenant-block">
        <h3 className="org-tenant-title">Filiallar <span>({branches.length})</span></h3>
        {branches.length === 0 ? (
          <p className="org-tenant-empty">Filial yo&apos;q.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table data-table--simple">
              <thead><tr><th>Nomi</th><th>Manzil</th><th>Telefon</th><th>Holat</th></tr></thead>
              <tbody>
                {branches.map((b, i) => (
                  <tr key={i}>
                    <td className="cell-main">{b.name}</td>
                    <td>{b.address ?? '—'}</td>
                    <td>{b.phone ?? '—'}</td>
                    <td><span className={`badge-status badge-status--${b.active ? 'active' : 'expired'}`}>{b.active ? 'Faol' : 'Nofaol'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
