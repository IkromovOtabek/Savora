import Link from 'next/link';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { fmtDate } from '@/lib/format';
import { searchPattern } from '@/lib/security';
import Icon from '@/components/icons/Icon';
import type { AuditEntity } from '@/lib/models/tenant/AuditLog';
import '@/components/tenant/styles/admin.css';

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

/** Obyekt sahifasi bor bo'limlar — yozuvdan to'g'ridan-to'g'ri ochish uchun */
const ENTITY_HREF: Partial<Record<AuditEntity, string>> = {
  product: '/app/products/',
  sale: '/app/sales/',
  customer: '/app/customers/',
};

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'Barchasi' },
  { key: 'product', label: 'Mahsulot' },
  { key: 'sale', label: 'Sotuv' },
  { key: 'finance', label: 'Kirim/Chiqim' },
  { key: 'user', label: 'Xodim' },
];

const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

/** Xavfli amallarni ajratib ko'rsatish uchun */
function isDanger(action: string): boolean {
  return action.includes('delete') || action.includes('price_change') || action.includes('reset_password');
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function auditHref(sp: { entity?: string; q?: string }, entity: string): string {
  const qs = new URLSearchParams();
  if (entity) qs.set('entity', entity);
  if (sp.q?.trim()) qs.set('q', sp.q.trim());
  const s = qs.toString();
  return `/app/audit${s ? `?${s}` : ''}`;
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
  if (sp.q?.trim()) filter.by = new RegExp(searchPattern(sp.q), 'i');

  const logs = await AuditLog.find(filter).sort({ at: -1 }).limit(300).lean();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = logs.filter((l) => new Date(l.at) >= todayStart).length;
  const dangerCount = logs.filter((l) => isDanger(l.action)).length;
  const actorCount = new Set(logs.map((l) => l.by)).size;

  // Kunlar bo'yicha guruhlash (yozuvlar allaqachon yangidan eskiga tartiblangan)
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const todayKey = dayKey(todayStart);
  const yesterdayKey = dayKey(yesterdayStart);
  const days: { key: string; title: string; items: typeof logs }[] = [];
  for (const l of logs) {
    const at = new Date(l.at);
    const key = dayKey(at);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      const title = key === todayKey ? 'Bugun' : key === yesterdayKey ? 'Kecha' : `${WEEKDAYS[at.getDay()]}, ${fmtDate(at)}`;
      day = { key, title, items: [] };
      days.push(day);
    }
    day.items.push(l);
  }

  const activeEntity = sp.entity && FILTERS.some((f) => f.key === sp.entity) ? sp.entity : '';
  const searching = Boolean(sp.q?.trim());

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">Amallar</h1>
          <p className="t-page-sub">Kim, qachon, nima qildi · oxirgi {logs.length} yozuv</p>
        </div>
      </div>

      <div className="ad-audit-kpis">
        <div className="ad-stat">
          <span className="ad-stat-l"><Icon name="clock" size={15} /> Bugun</span>
          <span className="ad-stat-v">{todayCount}</span>
        </div>
        <div className={`ad-stat${dangerCount > 0 ? ' ad-stat--danger' : ''}`}>
          <span className="ad-stat-l"><Icon name="alert" size={15} /> Xavfli<span className="ad-hide-sm"> amallar</span></span>
          <span className="ad-stat-v">{dangerCount}</span>
        </div>
        <div className="ad-stat">
          <span className="ad-stat-l"><Icon name="users" size={15} /> Xodimlar</span>
          <span className="ad-stat-v">{actorCount}</span>
        </div>
      </div>

      <form className="ad-filters" role="search" action="/app/audit">
        <nav className="ad-chips ux-scrollx" aria-label="Bo'lim bo'yicha saralash">
          {FILTERS.map((f) => (
            <Link
              key={f.key || 'all'}
              href={auditHref(sp, f.key)}
              className="ad-chip"
              aria-current={activeEntity === f.key ? 'page' : undefined}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <div className="ad-search">
          <Icon name="search" size={16} className="ad-search-ic" />
          <label htmlFor="audit-q" className="sr-only">Xodim loginini qidirish</label>
          <input
            id="audit-q"
            type="search"
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder="Xodim loginini qidirish…"
            autoComplete="off"
          />
          {activeEntity && <input type="hidden" name="entity" value={activeEntity} />}
          <button className="btn btn-sm btn-ghost" type="submit">Qidirish</button>
        </div>
      </form>

      {logs.length === 0 ? (
        <div className="ad-group">
          <div className="ad-empty">
            <span className="ad-empty-ic"><Icon name="history" size={26} /></span>
            {searching || activeEntity ? (
              <>
                <h3>Hech narsa topilmadi</h3>
                <p>Boshqa bo&apos;limni tanlang yoki qidiruvni tozalang.</p>
                <Link href="/app/audit" className="btn btn-tinted btn-sm">Filtrni tozalash</Link>
              </>
            ) : (
              <>
                <h3>Hali amallar yo&apos;q</h3>
                <p>Xodimlar sotuv, mahsulot yoki kassa bilan ishlaganda har bir amal shu yerda ko&apos;rinadi.</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="ad-timeline">
          {days.map((d) => (
            <section key={d.key} aria-labelledby={`day-${d.key}`}>
              <div className="ad-day-head">
                <h2 id={`day-${d.key}`}>{d.title}</h2>
                <span>{d.items.length} ta amal</span>
              </div>
              <ol className="ad-group ad-ev">
                {d.items.map((l) => {
                  const danger = isDanger(l.action);
                  const base = ENTITY_HREF[l.entity];
                  const href = base && l.entityId && !l.action.includes('delete') ? `${base}${l.entityId}` : null;
                  const at = new Date(l.at);
                  return (
                    <li key={String(l._id)} className={`ad-ev-item${danger ? ' ad-ev-item--danger' : ''}`}>
                      <div className="ad-ev-rail">
                        <span
                          className={`ad-avatar ad-avatar--sm${l.byRole === 'admin' && !danger ? ' ad-avatar--admin' : ''}`}
                          aria-hidden="true"
                        >
                          {danger ? <Icon name="alert" size={15} /> : (l.by || '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="ad-ev-body">
                        <p className="ad-ev-line">
                          <b>{l.by}</b> · {l.summary}
                        </p>
                        <div className="ad-ev-meta">
                          <span className={`ad-pill${danger ? ' ad-pill--danger' : ''}`}>{ENTITY_LABELS[l.entity] ?? l.entity}</span>
                          <span>{l.byRole === 'admin' ? 'Admin' : 'Xodim'}</span>
                          {href && (
                            <Link href={href}>
                              Ochish <Icon name="chevron" size={12} className="ad-chev" />
                            </Link>
                          )}
                        </div>
                      </div>
                      <time className="ad-ev-time" dateTime={at.toISOString()}>{hhmm(at)}</time>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
