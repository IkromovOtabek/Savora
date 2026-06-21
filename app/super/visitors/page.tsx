import { requireSuperAdmin } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import { parseDeviceLabel } from '@/lib/visitAnalytics';
import type { IVisitEvent } from '@/lib/models/master/SiteVisit';
import Icon from '@/components/icons/Icon';

export const metadata = { title: 'Tashriflar — Super Admin' };

function fmtDateTime(d?: Date | string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDuration(sec: number) {
  if (sec < 60) return `${sec} sek`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} daq ${s} sek` : `${m} daq`;
}

function apiSummary(events: IVisitEvent[]): string {
  const apis = events.filter((e) => e.type === 'api');
  if (!apis.length) return '—';
  const unique = [...new Set(apis.map((e) => e.path))];
  if (unique.length <= 2) return unique.join(', ');
  return `${unique.slice(0, 2).join(', ')} +${unique.length - 2}`;
}

export default async function SuperVisitorsPage() {
  await requireSuperAdmin();
  const { SiteVisit } = await getMasterModels();
  const visits = await SiteVisit.find().sort({ startedAt: -1 }).limit(200).lean();

  const total = visits.length;
  const signedUp = visits.filter((v) => v.signedUp).length;
  const eligible = visits.filter((v) => v.signupPromptEligible).length;

  return (
    <>
      <div className="super-page-head">
        <div>
          <h1>Tashriflar</h1>
          <p>Kim tashrif buyurdi, qayerdan, qaysi API va SignUp holati</p>
        </div>
      </div>

      <div className="super-stats">
        <div className="super-stat">
          <Icon name="user" size={22} className="super-stat-icon" />
          <strong>{total}</strong>
          <span>Oxirgi 200 tashrif</span>
        </div>
        <div className="super-stat super-stat--ok">
          <Icon name="signup" size={22} className="super-stat-icon" />
          <strong>{signedUp}</strong>
          <span>SignUp bo&apos;lgan</span>
        </div>
        <div className="super-stat super-stat--brand">
          <Icon name="bell" size={22} className="super-stat-icon" />
          <strong>{eligible}</strong>
          <span>45+ sek qolgan</span>
        </div>
      </div>

      <div className="panel">
        {visits.length === 0 ? (
          <div className="panel-empty">
            <p>Hozircha tashrif yozuvlari yo&apos;q.</p>
            <p className="cell-sub">Marketing sahifalariga kirgan mehmonlar shu yerda ko&apos;rinadi.</p>
          </div>
        ) : (
          <div className="table-wrap sold-table-wrap">
            <table className="data-table data-table--simple visitor-table">
              <thead>
                <tr>
                  <th>Vaqt</th>
                  <th>Mehmon</th>
                  <th>Qayerdan</th>
                  <th>Sahifa</th>
                  <th>Davomiylik</th>
                  <th>API</th>
                  <th>SignUp</th>
                  <th>Modal</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.sessionId}>
                    <td>
                      <div className="cell-main">{fmtDateTime(v.startedAt)}</div>
                      <div className="cell-sub">Oxirgi: {fmtDateTime(v.lastSeenAt)}</div>
                    </td>
                    <td>
                      <div className="cell-main">{parseDeviceLabel(v.userAgent)}</div>
                      <div className="cell-sub"><code className="imei-code">{v.visitorId.slice(0, 8)}…</code></div>
                      {v.ip && <div className="cell-sub">{v.ip}</div>}
                    </td>
                    <td>
                      <div className="cell-main">{v.referrerHost || '—'}</div>
                      {v.utmSource && <div className="cell-sub">utm: {v.utmSource}</div>}
                    </td>
                    <td>
                      <div className="cell-main">{v.landingPage}</div>
                      {v.currentPage && v.currentPage !== v.landingPage && (
                        <div className="cell-sub">→ {v.currentPage}</div>
                      )}
                    </td>
                    <td>{fmtDuration(v.activeSeconds || 0)}</td>
                    <td>
                      <span title={v.events.filter((e) => e.type === 'api').map((e) => `${e.method || 'GET'} ${e.path}`).join('\n')}>
                        {apiSummary(v.events)}
                      </span>
                    </td>
                    <td>
                      {v.signedUp ? (
                        <span className="badge-status badge-status--active">Ha</span>
                      ) : (
                        <span className="badge-status badge-status--suspended">Yo&apos;q</span>
                      )}
                      {v.organizationSlug && (
                        <div className="cell-sub">{v.organizationSlug}</div>
                      )}
                    </td>
                    <td>
                      {v.signupModalShown ? (
                        v.signupModalDismissed ? 'Yopildi' : 'Ko&apos;rsatildi'
                      ) : v.signupPromptEligible ? (
                        'Mos (45s+)'
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="field-hint" style={{ marginTop: 12 }}>
        API ro&apos;yxati: mehmon brauzerida chaqirilgan <code>/api/*</code> so&apos;rovlar (analytics dan tashqari).
        SignUp — ro&apos;yxatdan o&apos;tgan tashrif bilan bog&apos;langan.
      </p>
    </>
  );
}
