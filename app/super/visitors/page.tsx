import { requireSuperAdmin } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import { parseDeviceLabel } from '@/lib/visitAnalytics';
import type { IVisitEvent } from '@/lib/models/master/SiteVisit';

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
  return /Mobi|Android|iPhone|iPod/i.test(ua) ? 'Mobil' : /iPad|Tablet/i.test(ua) ? 'Planshet' : 'Desktop';
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

  return (
    <>
      <div className="super-page-head">
        <div>
          <h1>Tashrif buyuruvchilar statistikasi</h1>
          <p>Kim tashrif buyurdi, qurilma, qaysi sahifa va onlayn holati</p>
        </div>
      </div>

      {/* Bugungi (tanlangan kun) tashriflar */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h2>
            <span className="v-dot v-dot--on" /> Tashriflar ({dayVisits.length})
            {onlineCount > 0 && <span className="v-online-tag"> · {onlineCount} online</span>}
          </h2>
          <form method="get" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" name="date" defaultValue={selectedDay} className="input-base" style={{ maxWidth: 170 }} />
            <button type="submit" className="btn btn-ghost btn-sm">Yangilash</button>
          </form>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Holat</th>
                <th>Foydalanuvchi</th>
                <th>Qurilma</th>
                <th>OS / Brauzer</th>
                <th>Sahifalar</th>
                <th>Kirdi</th>
                <th>Chiqdi</th>
              </tr>
            </thead>
            <tbody>
              {dayVisits.length === 0 ? (
                <tr><td colSpan={7}><div className="cell-sub" style={{ padding: 8 }}>Bu kuni tashrif yo&apos;q.</div></td></tr>
              ) : dayVisits.map((v) => {
                const online = new Date(v.lastSeenAt).getTime() >= onlineCutoff.getTime();
                const known = v.signedUp || !!v.organizationSlug;
                const status = online ? 'online' : known ? 'left' : 'idle';
                const statusLabel = online ? 'Online' : known ? 'Chiqdi' : 'Faolsiz';
                return (
                  <tr key={v.sessionId}>
                    <td data-label="Holat"><span className={`v-status v-status--${status}`}><span className="v-dot" /> {statusLabel}</span></td>
                    <td data-label="Foydalanuvchi">
                      {v.organizationSlug
                        ? <span className="cell-main">{v.organizationSlug}</span>
                        : <span className="cell-sub" style={{ fontStyle: 'italic' }}>Mehmon</span>}
                    </td>
                    <td data-label="Qurilma">{deviceType(v.userAgent)}</td>
                    <td data-label="OS / Brauzer">{parseDeviceLabel(v.userAgent)}</td>
                    <td data-label="Sahifalar"><span className="v-pages">{pageCount(v.events)}</span></td>
                    <td data-label="Kirdi">{timeOnly(v.startedAt)}</td>
                    <td data-label="Chiqdi" className="cell-sub">{online ? '—' : timeOnly(v.lastSeenAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* So'nggi 14 kun */}
      <div className="panel">
        <div className="panel-head"><h2>So&apos;nggi 14 kun</h2></div>
        <div className="table-wrap">
          <table className="data-table v-14-table">
            <thead>
              <tr><th>Sana</th><th style={{ textAlign: 'center' }}>Tashriflar</th><th style={{ textAlign: 'center' }}>Ro&apos;yxatdan</th><th style={{ textAlign: 'center' }}>Login</th></tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.key}>
                  <td data-label="Sana">
                    <code className="imei-code">{d.key}</code>
                    {d.key === today && <span className="badge-status badge-status--active" style={{ marginLeft: 8 }}>bugun</span>}
                  </td>
                  <td data-label="Tashriflar" style={{ textAlign: 'center' }}><span className="v-num v-num--visit">{d.visits}</span></td>
                  <td data-label="Ro'yxatdan" style={{ textAlign: 'center' }}><span className="v-num v-num--signup">{d.signups}</span></td>
                  <td data-label="Login" style={{ textAlign: 'center' }}><span className="v-num v-num--login">{d.logins}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
