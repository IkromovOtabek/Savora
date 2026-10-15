import { requireSuperAdmin } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import { parseDeviceLabel } from '@/lib/visitAnalytics';
import type { IVisitEvent } from '@/lib/models/master/SiteVisit';
import { Kpi, PageTitle, Pill } from '@/components/super/ui';

export const metadata = { title: 'Tashriflar — Super Admin' };

const ONLINE_MS = 5 * 60 * 1000;

function timeOnly(d?: Date | string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}
function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}
function deviceType(ua?: string): string {
  if (!ua) return 'Noma\'lum';
  return /Mobi|Android|iPhone|iPod/i.test(ua) ? 'Mobil' : /iPad|Tablet/i.test(ua) ? 'Planshet' : 'Kompyuter';
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
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    days.push({ key: dayKey(d), visits: 0, signups: 0, logins: 0 });
  }
  const dayMap = new Map(days.map((d) => [d.key, d]));
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
        title="Tashriflar"
        sub="Kim tashrif buyurdi, qaysi qurilmadan, nechta sahifa ko'rdi va hozir onlaynmi"
        actions={
          <form method="get" className="sa-form-actions">
            <label htmlFor="v-date" className="sa-count">Kun</label>
            <input id="v-date" type="date" name="date" defaultValue={selectedDay} className="sa-input" style={{ width: 170 }} />
            <button type="submit" className="sa-btn sa-btn--tinted sa-btn--sm">Ko&apos;rsatish</button>
          </form>
        }
      />

      <div className="sa-kpis">
        <Kpi label="Tashriflar" value={dayVisits.length} icon="chart" tone="b" delta={selectedDay === today ? 'Bugun' : selectedDay} />
        <Kpi label="Hozir onlayn" value={onlineCount} icon="globe" tone="o" delta="So'nggi 5 daqiqa" deltaTone={onlineCount > 0 ? 'ok' : undefined} />
        <Kpi label="Ro'yxatdan o'tdi" value={signedToday} icon="signup" tone="v" />
        <Kpi label="Do'kon foydalanuvchisi" value={knownToday} icon="store" tone="a" />
      </div>

      {/* Tanlangan kun tashriflari */}
      <section className="sa-card">
        <div className="sa-card-h">
          <div>
            <h2>Tashriflar ro&apos;yxati</h2>
            <p>{dayVisits.length} ta sessiya{onlineCount > 0 ? ` · ${onlineCount} onlayn` : ''}</p>
          </div>
        </div>
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Holat</th>
                <th>Foydalanuvchi</th>
                <th>Qurilma</th>
                <th>OS / brauzer</th>
                <th className="sa-td-c">Sahifalar</th>
                <th>Kirdi</th>
                <th>Chiqdi</th>
              </tr>
            </thead>
            <tbody>
              {dayVisits.length === 0 ? (
                <tr><td colSpan={7}><div className="sa-empty">Bu kuni tashrif yo&apos;q.</div></td></tr>
              ) : dayVisits.map((v) => {
                const online = new Date(v.lastSeenAt).getTime() >= onlineCutoff.getTime();
                const known = v.signedUp || !!v.organizationSlug;
                const statusLabel = online ? 'Onlayn' : known ? 'Chiqdi' : 'Faolsiz';
                return (
                  <tr key={v.sessionId}>
                    <td>
                      <span className="sa-status"><span className={`sa-dot${online ? ' sa-dot--on' : ''}`} /> {statusLabel}</span>
                    </td>
                    <td>
                      {v.organizationSlug
                        ? <span className="sa-td-main">{v.organizationSlug}</span>
                        : <span className="sa-td-sub" style={{ fontStyle: 'italic', margin: 0 }}>Mehmon</span>}
                    </td>
                    <td>{deviceType(v.userAgent)}</td>
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
        <div className="sa-card-h"><h2>So&apos;nggi 14 kun</h2></div>
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Sana</th>
                <th className="sa-td-r">Tashriflar</th>
                <th className="sa-td-r">Ro&apos;yxatdan</th>
                <th className="sa-td-r">Kirish</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.key}>
                  <td>
                    <span className="sa-code">{d.key}</span>
                    {d.key === today && <> <Pill tone="ok">bugun</Pill></>}
                  </td>
                  <td className="sa-td-r"><b>{d.visits}</b></td>
                  <td className="sa-td-r" style={{ color: d.signups ? 'var(--accent)' : 'var(--ink-3)' }}>{d.signups}</td>
                  <td className="sa-td-r" style={{ color: 'var(--ink-3)' }}>{d.logins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
