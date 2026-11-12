import { getTenantModels } from '@/lib/tenantDb';
import { listOrgLogins, type OrgLoginRow } from '@/lib/orgLogins';
import { getDict } from '@/lib/i18n/server';
import { Pill } from './ui';
import OrgLoginsEditor from './OrgLoginsEditor';

/** Biznesning tenant bazasidan xodimlar (login/parolni o'zgartirish bilan) va filiallar */
export default async function OrgTenantSummary({ orgId, dbName }: { orgId: string; dbName: string }) {
  const d = await getDict();
  const s = d.superPanel.orgTenant;
  let logins: OrgLoginRow[] = [];
  let branches: { name: string; address?: string; phone?: string; active: boolean }[] = [];
  let failed = false;

  try {
    const { Branch } = await getTenantModels(dbName);
    const [u, b] = await Promise.all([
      listOrgLogins(dbName),
      Branch.find().sort({ createdAt: 1 }).lean(),
    ]);
    logins = u;
    branches = b.map((x) => ({ name: x.name, address: x.address, phone: x.phone, active: x.active }));
  } catch {
    failed = true;
  }

  if (failed) {
    return <div className="sa-empty">{d.superPanel.loadFailed}</div>;
  }

  return (
    <>
      <OrgLoginsEditor orgId={orgId} rows={logins} />

      <div className="sa-section">
        <div className="sa-ghead">{s.branches} <span className="sa-count">{branches.length}</span></div>
        <div className="sa-group" style={{ background: 'var(--bg-soft)' }}>
          {branches.length === 0 ? (
            <div className="sa-empty">{s.noBranches}</div>
          ) : branches.map((b, i) => (
            <div key={i} className="sa-cell">
              <span className="sa-cell-t">
                <b>{b.name}</b>
                <small>{[b.address, b.phone].filter(Boolean).join(' · ') || '—'}</small>
              </span>
              <Pill tone={b.active ? 'ok' : 'bad'}>{b.active ? d.common.active : d.common.inactive}</Pill>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
