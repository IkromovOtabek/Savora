import { getTenantModels } from '@/lib/tenantDb';
import { Avatar, Pill } from './ui';

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
    return <div className="sa-empty">Ma&apos;lumotlarni yuklab bo&apos;lmadi.</div>;
  }

  return (
    <>
      <div className="sa-section">
        <div className="sa-ghead">Xodimlar <span className="sa-count">{users.length}</span></div>
        <div className="sa-group" style={{ background: 'var(--bg-soft)' }}>
          {users.length === 0 ? (
            <div className="sa-empty">Xodim yo&apos;q.</div>
          ) : users.map((u, i) => (
            <div key={i} className="sa-cell sa-cell--av">
              <Avatar name={u.fullName || u.username} />
              <span className="sa-cell-t">
                <b>{u.fullName || u.username}</b>
                <small>{u.username} · {u.role === 'admin' ? 'Admin' : 'Xodim'}</small>
              </span>
              <Pill tone={u.active ? 'ok' : 'bad'}>{u.active ? 'Faol' : 'Nofaol'}</Pill>
            </div>
          ))}
        </div>
      </div>

      <div className="sa-section">
        <div className="sa-ghead">Filiallar <span className="sa-count">{branches.length}</span></div>
        <div className="sa-group" style={{ background: 'var(--bg-soft)' }}>
          {branches.length === 0 ? (
            <div className="sa-empty">Filial yo&apos;q.</div>
          ) : branches.map((b, i) => (
            <div key={i} className="sa-cell">
              <span className="sa-cell-t">
                <b>{b.name}</b>
                <small>{[b.address, b.phone].filter(Boolean).join(' · ') || '—'}</small>
              </span>
              <Pill tone={b.active ? 'ok' : 'bad'}>{b.active ? 'Faol' : 'Nofaol'}</Pill>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
