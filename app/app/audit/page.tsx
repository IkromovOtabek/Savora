import { getTenantAdminSession } from '@/lib/tenantSession';
import { fmtDateTime } from '@/lib/format';
import type { AuditEntity } from '@/lib/models/tenant/AuditLog';

export const metadata = { title: 'Amallar — Savora' };

const ENTITY_LABELS: Record<AuditEntity, string> = {
  product: 'Mahsulot',
  sale: 'Sotuv',
  user: 'Xodim',
  branch: 'Filial',
  customer: 'Mijoz',
  finance: 'Kirim/Chiqim',
  transfer: "Ko'chirish",
  creditBank: 'Bank',
  auth: 'Kirish',
};

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'Barchasi' },
  { key: 'product', label: 'Mahsulot' },
  { key: 'sale', label: 'Sotuv' },
  { key: 'finance', label: 'Kirim/Chiqim' },
  { key: 'user', label: 'Xodim' },
];

/** Xavfli amallarni ajratib ko'rsatish uchun */
function isDanger(action: string): boolean {
  return action.includes('delete') || action.includes('price_change') || action.includes('reset_password');
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const { AuditLog } = await getTenantAdminSession();

  const filter: Record<string, unknown> = {};
  if (sp.entity && FILTERS.some((f) => f.key === sp.entity)) filter.entity = sp.entity;
  if (sp.q?.trim()) filter.by = new RegExp(sp.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  const logs = await AuditLog.find(filter).sort({ at: -1 }).limit(300).lean();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = logs.filter((l) => new Date(l.at) >= todayStart).length;

  return (
    <>
      <div className="dash-head">
        <div>
          <h1 className="dash-hello">Amallar</h1>
          <p className="dash-sub">
            Kim, qachon, nima qildi · Bugun: {todayCount} ta amal · Oxirgi {logs.length} yozuv
          </p>
        </div>
      </div>

      <form className="filter-bar" style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTERS.map((f) => (
          <a
            key={f.key || 'all'}
            href={`/app/audit${f.key ? `?entity=${f.key}` : ''}`}
            className={`btn btn-sm ${(sp.entity ?? '') === f.key ? 'btn-primary' : 'btn-ghost'}`}
          >
            {f.label}
          </a>
        ))}
        <input
          type="search"
          name="q"
          defaultValue={sp.q ?? ''}
          placeholder="Xodim loginini qidirish…"
          className="input-base"
          style={{ maxWidth: 220, marginLeft: 'auto' }}
        />
        {sp.entity && <input type="hidden" name="entity" value={sp.entity} />}
        <button className="btn btn-sm btn-ghost" type="submit">Qidirish</button>
      </form>

      <div className="panel" style={{ marginTop: 16 }}>
        {logs.length === 0 ? (
          <div className="panel-empty">
            <p>Hali audit yozuvlari yo&apos;q. Amallar bajarilganda bu yerda ko&apos;rinadi.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sana / Vaqt</th>
                  <th>Bo&apos;lim</th>
                  <th>Amal</th>
                  <th>Kim</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={String(l._id)}>
                    <td data-label="Sana / Vaqt"><div className="cell-sub">{fmtDateTime(l.at)}</div></td>
                    <td data-label="Bo'lim">
                      <span className="badge-status badge-status--active">{ENTITY_LABELS[l.entity] ?? l.entity}</span>
                    </td>
                    <td data-label="Amal">
                      <div className="cell-main" style={isDanger(l.action) ? { color: 'var(--danger, #dc2626)' } : undefined}>
                        {l.summary}
                      </div>
                    </td>
                    <td data-label="Kim">
                      <div className="cell-main">{l.by}</div>
                      <div className="cell-sub">{l.byRole === 'admin' ? 'Admin' : 'Xodim'}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
