import { requireSuperAdmin } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import { parseDeviceLabel } from '@/lib/visitAnalytics';
import type { IVisitEvent } from '@/lib/models/master/SiteVisit';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import { Kpi, PageTitle, Pill } from '@/components/super/ui';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.superPanel.visitors.metaTitle };
}

const ONLINE_MS = 5 * 60 * 1000;

function timeOnly(d?: Date | string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}
function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}
/** YYYY-MM-DD ga ±n kun (UTC tushda — kun chegarasidan qochish) */
function shiftDay(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dayLabel(key: string): string {
  const [y, m, d] = key.split('-');
  return `${d}.${m}.${y}`;
}
function deviceType(ua?: string): 'unknown' | 'mobile' | 'tablet' | 'desktop' {
  if (!ua) return 'unknown';
  return /Mobi|Android|iPhone|iPod/i.test(ua) ? 'mobile' : /iPad|Tablet/i.test(ua) ? 'tablet' : 'desktop';
}
function pageCount(events: IVisitEvent[]): number {
  const pages = events.filter((e) => e.type === 'page').length;
  return pages || 1;
}

export default async function SuperVisitorsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const d = await getDict();
  const s = d.superPanel.visitors;
  const { SiteVisit } = await getMasterModels();

  // Tanlangan kun (default — bugun)
  const selectedDay = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : dayKey(new Date());
  const dayStart = new Date(`${selectedDay}T00:00:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const since14 = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
  since14.setHours(0, 0, 0, 0);
  const onlineCutoff = new Date(Date.now() - ONLINE_MS);

  const [dayVisits, last14] = await Promise.all([
    SiteVisit.find({ startedAt: { $gte: dayStart, $lt: dayEnd } }).sort({ startedAt: -1 }).limit(500).lean(),
    SiteVisit.find({ startedAt: { $gte: since14 } }).select('startedAt signedUp').lean(),
  ]);

  const onlineCount = dayVisits.filter((v) => new Date(v.lastSeenAt).getTime() >= onlineCutoff.getTime()).length;

  // So'nggi 14 kun jadvali
  const days: { key: string; visits: number; signups: number; logins: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const dt = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    days.push({ key: dayKey(dt), visits: 0, signups: 0, logins: 0 });
  }
  const dayMap = new Map(days.map((x) => [x.key, x]));
  for (const v of last14) {
    const row = dayMap.get(dayKey(new Date(v.startedAt)));
    if (row) { row.visits++; if (v.signedUp) row.signups++; }
  }
  const today = dayKey(new Date());
  const signedToday = dayVisits.filter((v) => v.signedUp).length;
  const knownToday = dayVisits.filter((v) => !!v.organizationSlug).length;

  return (
    <>
      <PageTitle
        title={s.title}
        sub={s.sub}
        actions={
          <nav className="ux-month sa-daynav" aria-label={s.dayNavAria}>
            <Link href={`/super/visitors?date=${shiftDay(selectedDay, -1)}`} aria-label={s.prevDay}>
              <Icon name="chevron" size={16} strokeWidth={2.4} className="sa-rot90" />
            </Link>
            <span className="ux-month-cur" aria-current="date">
              {selectedDay === today ? d.common.today : selectedDay === shiftDay(today, -1) ? d.common.yesterday : dayLabel(selectedDay)}
            </span>
            <Link
              href={`/super/visitors?date=${shiftDay(selectedDay, 1)}`}
              aria-label={s.nextDay}
              aria-disabled={selectedDay >= today ? 'true' : undefined}
              tabIndex={selectedDay >= today ? -1 : undefined}
            >
              <Icon name="chevron" size={16} strokeWidth={2.4} className="sa-rot-90" />
            </Link>
            {selectedDay !== today && <Link href="/super/visitors">{d.common.today}</Link>}
          </nav>
        }
      />

      <div className="ux-strip">
        <Kpi label={s.title} value={dayVisits.length} icon="chart" tone="b" delta={selectedDay === today ? d.common.today : dayLabel(selectedDay)} />
        <Kpi label={s.onlineNow} value={onlineCount} icon="globe" tone="o" delta={s.last5min} deltaTone={onlineCount > 0 ? 'ok' : undefined} />
        <Kpi label={s.signedUp} value={signedToday} icon="signup" tone="v" />
        <Kpi label={s.storeUser} value={knownToday} icon="store" tone="a" />
      </div>

      {/* Tanlangan kun tashriflari */}
      <section className="sa-card">
        <div className="sa-card-h">
          <div>
            <h2>{s.listTitle}</h2>
            <p>{tr(s.nSessions, { n: dayVisits.length })}{onlineCount > 0 ? tr(s.nOnline, { n: onlineCount }) : ''}</p>
          </div>
        </div>
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>{s.colStatus}</th>
                <th>{s.colUser}</th>
                <th>{s.colDevice}</th>
                <th>{s.colOs}</th>
                <th className="sa-td-c">{s.colPages}</th>
                <th>{s.colIn}</th>
                <th>{s.colOut}</th>
              </tr>
            </thead>
            <tbody>
              {dayVisits.length === 0 ? (
                <tr><td colSpan={7}>
                  <div className="ux-empty">
                    <span className="ux-empty-ic"><Icon name="chart" size={24} /></span>
                    <b>{s.noVisitsTitle}</b>
                    <p>{s.noVisitsText}</p>
                  </div>
                </td></tr>
              ) : dayVisits.map((v) => {
                const online = new Date(v.lastSeenAt).getTime() >= onlineCutoff.getTime();
                const known = v.signedUp || !!v.organizationSlug;
                const statusLabel = online ? s.stOnline : known ? s.stLeft : s.stIdle;
                return (
                  <tr key={v.sessionId}>
                    <td>
                      <span className="sa-status"><span className={`sa-dot${online ? ' sa-dot--on' : ''}`} /> {statusLabel}</span>
                    </td>
                    <td>
                      {v.organizationSlug
                        ? <span className="sa-td-main">{v.organizationSlug}</span>
                        : <span className="sa-td-sub" style={{ fontStyle: 'italic', margin: 0 }}>{s.guest}</span>}
                    </td>
                    <td>{s.device[deviceType(v.userAgent)]}</td>
                    <td>{parseDeviceLabel(v.userAgent)}</td>
                    <td className="sa-td-c"><Pill tone="br">{pageCount(v.events)}</Pill></td>
                    <td>{timeOnly(v.startedAt)}</td>
                    <td style={{ color: 'var(--ink-3)' }}>{online ? '—' : timeOnly(v.lastSeenAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* So'nggi 14 kun */}
      <section className="sa-card">
        <div className="sa-card-h"><div><h2>{s.last14}</h2><p>{s.last14Text}</p></div></div>
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>{d.common.date}</th>
                <th className="sa-td-r">{s.title}</th>
                <th className="sa-td-r">{s.colSignups}</th>
                <th className="sa-td-r">{s.colLogins}</th>
              </tr>
            </thead>
            <tbody>
              {days.map((x) => (
                <tr key={x.key} aria-current={x.key === selectedDay ? 'date' : undefined} className={x.key === selectedDay ? 'sa-tr-on' : undefined}>
                  <td>
                    <Link href={`/super/visitors?date=${x.key}`} className="sa-td-main">{dayLabel(x.key)}</Link>
                    {x.key === today && <> <Pill tone="ok">{s.todayPill}</Pill></>}
                  </td>
                  <td className="sa-td-r"><b>{x.visits}</b></td>
                  <td className="sa-td-r" style={{ color: x.signups ? 'var(--accent)' : 'var(--ink-3)' }}>{x.signups}</td>
                  <td className="sa-td-r" style={{ color: 'var(--ink-3)' }}>{x.logins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
