import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import { isOrganizationActive, isTrialActive, daysUntilExpiry } from '@/lib/models/master/Organization';
import { resolveOrgPlan, PLAN_PRESETS } from '@/lib/plans';
import { getOrgDisplayStatus } from '@/lib/organizations';
import Icon from '@/components/icons/Icon';

export const metadata = { title: 'Asosiy sahifa — Super Admin' };

function fmtSum(n: number) {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(n));
}
function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function SuperDashboardHome() {
  await requireSuperAdmin();
  const { Organization, PaymentRequest, SiteVisit } = await getMasterModels();

  const now = new Date();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000); weekAgo.setHours(0, 0, 0, 0);
  const onlineCutoff = new Date(Date.now() - 5 * 60 * 1000);

  const [orgs, pendingPayments, todayVisits, weekVisits, onlineCount, recentVisitsSignup] = await Promise.all([
    Organization.find().sort({ createdAt: -1 }).lean(),
    PaymentRequest.countDocuments({ status: 'pending' }),
    SiteVisit.countDocuments({ startedAt: { $gte: todayStart } }),
    SiteVisit.find({ startedAt: { $gte: weekAgo } }).select('startedAt signedUp').lean(),
    SiteVisit.countDocuments({ lastSeenAt: { $gte: onlineCutoff } }),
    SiteVisit.countDocuments({ signedUp: true, signedUpAt: { $gte: monthStart } }),
  ]);

  // --- Biznes statistikasi ---
  const total = orgs.length;
  const active = orgs.filter((o) => isOrganizationActive(o));
  const trialCount = orgs.filter((o) => isTrialActive(o)).length;
  const expiredCount = orgs.filter((o) => o.status === 'expired' || !isOrganizationActive(o)).length;
  const mrr = active.filter((o) => !o.plan?.isTrial && o.plan?.tier !== 'free')
    .reduce((s, o) => s + (resolveOrgPlan(o).monthlyPayment || 0), 0);
  const newThisMonth = orgs.filter((o) => o.createdAt && new Date(o.createdAt) >= monthStart).length;
  const expiringSoon = active
    .map((o) => ({ org: o, days: daysUntilExpiry(o) }))
    .filter((x) => x.days >= 0 && x.days <= 7)
    .sort((a, b) => a.days - b.days);

  // Tariflar bo'yicha taqsimot
  const byTier: Record<string, number> = {};
  for (const o of orgs) byTier[o.plan?.tier ?? 'free'] = (byTier[o.plan?.tier ?? 'free'] ?? 0) + 1;

  // --- 7 kunlik tashrif grafigi ---
  const days: { key: string; label: string; visits: number; signups: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    days.push({ key: dayKey(d), label: `${d.getDate()}/${d.getMonth() + 1}`, visits: 0, signups: 0 });
  }
  const dayMap = new Map(days.map((d) => [d.key, d]));
  for (const v of weekVisits) {
    const k = dayKey(new Date(v.startedAt));
    const row = dayMap.get(k);
    if (row) { row.visits++; if (v.signedUp) row.signups++; }
  }
  const maxVisits = Math.max(1, ...days.map((d) => d.visits));

  return (
    <>
      <div className="super-page-head">
        <div>
          <h1>Boshqaruv paneli</h1>
          <p>Platformaning bugungi holatini kuzating</p>
        </div>
        <Link href="/super/organizations/new" className="btn btn-primary btn-with-icon">
          <Icon name="plus" size={18} /> Yangi biznes
        </Link>
      </div>

      {/* Asosiy ko'rsatkichlar */}
      <div className="super-stats">
        <div className="super-stat super-stat--brand">
          <Icon name="wallet" size={22} className="super-stat-icon" />
          <strong>{fmtSum(mrr)}</strong><span>MRR (oylik daromad, so&apos;m)</span>
        </div>
        <div className="super-stat super-stat--ok">
          <Icon name="store" size={22} className="super-stat-icon" />
          <strong>{active.length}</strong><span>Faol biznes</span>
        </div>
        <div className="super-stat">
          <Icon name="building" size={22} className="super-stat-icon" />
          <strong>{total}</strong><span>Jami biznes</span>
          <em className="super-stat-hint">+{newThisMonth} shu oyda</em>
        </div>
        <div className="super-stat super-stat--warn">
          <Icon name="wallet" size={22} className="super-stat-icon" />
          <strong>{pendingPayments}</strong><span>Kutilayotgan to&apos;lov</span>
        </div>
      </div>

      {/* Ikkilamchi ko'rsatkichlar */}
      <div className="super-substats">
        <div className="super-substat"><span>Sinovda</span><strong>{trialCount}</strong></div>
        <div className="super-substat"><span>7 kunda tugaydi</span><strong>{expiringSoon.length}</strong></div>
        <div className="super-substat"><span>Muddati tugagan</span><strong>{expiredCount}</strong></div>
        <div className="super-substat"><span>Bugun tashrif</span><strong>{todayVisits}</strong></div>
        <div className="super-substat"><span>Hozir onlayn</span><strong className="online-num">{onlineCount}</strong></div>
        <div className="super-substat"><span>Oylik ro&apos;yxatdan</span><strong>{recentVisitsSignup}</strong></div>
      </div>

      <div className="super-dash-grid">
        {/* Tashrif grafigi (7 kun) */}
        <div className="panel">
          <div className="panel-head">
            <h2>Tashriflar (7 kun)</h2>
            <Link href="/super/visitors" className="cell-link" style={{ fontSize: '.85rem' }}>Batafsil →</Link>
          </div>
          <div className="dash-chart">
            {days.map((d) => (
              <div key={d.key} className="dash-bar-col" title={`${d.label}: ${d.visits} tashrif, ${d.signups} ro'yxat`}>
                <div className="dash-bar-track">
                  <div className="dash-bar" style={{ height: `${Math.round((d.visits / maxVisits) * 100)}%` }} />
                </div>
                <span className="dash-bar-val">{d.visits}</span>
                <span className="dash-bar-label">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tariflar taqsimoti */}
        <div className="panel">
          <div className="panel-head"><h2>Tariflar bo&apos;yicha</h2></div>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(['free', 'starter', 'pro', 'business', 'custom'] as const).map((t) => {
              const c = byTier[t] ?? 0;
              const pct = total ? Math.round((c / total) * 100) : 0;
              const label = PLAN_PRESETS[t]?.label ?? t;
              if (c === 0) return null;
              return (
                <div key={t}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.85rem', marginBottom: 4 }}>
                    <span>{label}</span><span className="cell-sub">{c} ({pct}%)</span>
                  </div>
                  <div className="dist-bar-track"><div className="dist-bar" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tez orada tugaydi */}
      {expiringSoon.length > 0 && (
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="panel-head"><h2>Tez orada tugaydi (7 kun)</h2></div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Biznes</th><th>Qolgan</th><th>Tarif</th><th></th></tr></thead>
              <tbody>
                {expiringSoon.slice(0, 8).map(({ org, days: d }) => (
                  <tr key={String(org._id)}>
                    <td><div className="cell-main">{org.name}</div><div className="cell-sub">{org.slug}</div></td>
                    <td><span className={`badge-status badge-status--${d <= 2 ? 'expired' : 'suspended'}`}>{d === 0 ? 'Bugun' : `${d} kun`}</span></td>
                    <td>{PLAN_PRESETS[org.plan?.tier as keyof typeof PLAN_PRESETS]?.label ?? org.plan?.tier}</td>
                    <td className="cell-actions"><Link href={`/super/organizations/${org._id}`} className="btn btn-primary btn-sm">Uzaytirish</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* So'nggi bizneslar */}
      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-head">
          <h2>So&apos;nggi bizneslar</h2>
          <Link href="/super" className="cell-link" style={{ fontSize: '.85rem' }}>Hammasi →</Link>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Biznes</th><th>Tarif</th><th>Holat</th><th>Sana</th></tr></thead>
            <tbody>
              {orgs.slice(0, 6).map((org) => {
                const st = getOrgDisplayStatus(org);
                return (
                  <tr key={String(org._id)}>
                    <td><Link href={`/super/organizations/${org._id}`} className="cell-link cell-main">{org.name}</Link><div className="cell-sub">{org.slug}</div></td>
                    <td>{PLAN_PRESETS[org.plan?.tier as keyof typeof PLAN_PRESETS]?.label ?? org.plan?.tier}</td>
                    <td><span className={`badge-status badge-status--${st.key}`}>{st.label}</span></td>
                    <td className="cell-sub">{org.createdAt ? new Date(org.createdAt).toLocaleDateString('uz-UZ') : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tezkor amallar */}
      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-head"><h2>Tezkor amallar</h2></div>
        <div className="quick-actions">
          <Link href="/super/organizations/new" className="quick-action"><Icon name="plus" size={18} /> Yangi biznes</Link>
          <Link href="/super/payments" className="quick-action"><Icon name="wallet" size={18} /> To&apos;lovlar{pendingPayments > 0 ? ` (${pendingPayments})` : ''}</Link>
          <Link href="/super/visitors" className="quick-action"><Icon name="chart" size={18} /> Tashriflar</Link>
          <Link href="/super/plans" className="quick-action"><Icon name="plans" size={18} /> Tariflar</Link>
        </div>
      </div>
    </>
  );
}
