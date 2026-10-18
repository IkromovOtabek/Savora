import Link from 'next/link';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { fmtDate } from '@/lib/format';
import { searchPattern } from '@/lib/security';
import Icon from '@/components/icons/Icon';
import type { AuditEntity } from '@/lib/models/tenant/AuditLog';
import { getI18n } from '@/lib/i18n/server';
import { tr, WEEKDAYS } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/admin.css';

export async function generateMetadata() {
  const { d } = await getI18n();
  return { title: d.crm.audit.metaTitle };
}

/** Obyekt sahifasi bor bo'limlar — yozuvdan to'g'ridan-to'g'ri ochish uchun */
const ENTITY_HREF: Partial<Record<AuditEntity, string>> = {
  product: '/app/products/',
  sale: '/app/sales/',
  customer: '/app/customers/',
  supplier: '/app/suppliers/',
};

/** Tez filtr chiplari ('' — barchasi); nomlari lug'atdan (d.crm.audit.entities) */
const FILTERS: readonly ('' | AuditEntity)[] = ['', 'product', 'sale', 'finance', 'user'];

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
  const { locale, d } = await getI18n();
  const A = d.crm.audit;

  const filter: Record<string, unknown> = {};
  if (sp.entity && FILTERS.some((f) => f === sp.entity)) filter.entity = sp.entity;
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
      const title = key === todayKey ? d.common.today : key === yesterdayKey ? d.common.yesterday : `${WEEKDAYS[locale][at.getDay()]}, ${fmtDate(at)}`;
      day = { key, title, items: [] };
      days.push(day);
    }
    day.items.push(l);
  }

  const activeEntity = sp.entity && FILTERS.some((f) => f === sp.entity) ? sp.entity : '';
  const searching = Boolean(sp.q?.trim());

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{A.title}</h1>
          <p className="t-page-sub">{tr(A.sub, { n: logs.length })}</p>
        </div>
      </div>

      <div className="ad-audit-kpis">
        <div className="ad-stat">
          <span className="ad-stat-l"><Icon name="clock" size={15} /> {d.common.today}</span>
          <span className="ad-stat-v">{todayCount}</span>
        </div>
        <div className={`ad-stat${dangerCount > 0 ? ' ad-stat--danger' : ''}`}>
          <span className="ad-stat-l"><Icon name="alert" size={15} /> {A.dangerShort}<span className="ad-hide-sm">{A.dangerLong}</span></span>
          <span className="ad-stat-v">{dangerCount}</span>
        </div>
        <div className="ad-stat">
          <span className="ad-stat-l"><Icon name="users" size={15} /> {A.actors}</span>
          <span className="ad-stat-v">{actorCount}</span>
        </div>
      </div>

      <form className="ad-filters" role="search" action="/app/audit">
        <nav className="ad-chips ux-scrollx" aria-label={A.filterAria}>
          {FILTERS.map((f) => (
            <Link
              key={f || 'all'}
              href={auditHref(sp, f)}
              className="ad-chip"
              aria-current={activeEntity === f ? 'page' : undefined}
            >
              {f ? A.entities[f] : d.common.all}
            </Link>
          ))}
        </nav>
        <div className="ad-search">
          <Icon name="search" size={16} className="ad-search-ic" />
          <label htmlFor="audit-q" className="sr-only">{A.searchLabel}</label>
          <input
            id="audit-q"
            type="search"
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder={A.searchPlaceholder}
            autoComplete="off"
          />
          {activeEntity && <input type="hidden" name="entity" value={activeEntity} />}
          <button className="btn btn-sm btn-ghost" type="submit">{d.common.search}</button>
        </div>
      </form>

      {logs.length === 0 ? (
        <div className="ad-group">
          <div className="ad-empty">
            <span className="ad-empty-ic"><Icon name="history" size={26} /></span>
            {searching || activeEntity ? (
              <>
                <h3>{d.common.nothingFound}</h3>
                <p>{A.notFoundText}</p>
                <Link href="/app/audit" className="btn btn-tinted btn-sm">{A.clearFilter}</Link>
              </>
            ) : (
              <>
                <h3>{A.emptyTitle}</h3>
                <p>{A.emptyText}</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="ad-timeline">
          {days.map((day) => (
            <section key={day.key} aria-labelledby={`day-${day.key}`}>
              <div className="ad-day-head">
                <h2 id={`day-${day.key}`}>{day.title}</h2>
                <span>{tr(A.nActions, { n: day.items.length })}</span>
              </div>
              <ol className="ad-group ad-ev">
                {day.items.map((l) => {
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
                          <span className={`ad-pill${danger ? ' ad-pill--danger' : ''}`}>{A.entities[l.entity] ?? l.entity}</span>
                          <span>{l.byRole === 'admin' ? d.common.admin : d.common.employee}</span>
                          {href && (
                            <Link href={href}>
                              {d.common.open} <Icon name="chevron" size={12} className="ad-chev" />
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
