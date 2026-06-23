import { requireSuperAdmin } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import { isOrganizationActive, isTrialActive, daysUntilExpiry } from '@/lib/models/master/Organization';
import { resolveOrgPlan } from '@/lib/plans';
import { fmtMoney } from '@/lib/format';

export const metadata = { title: 'Metrikalar — Savora' };

const MONTHS_UZ = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

export default async function SuperMetricsPage() {
  await requireSuperAdmin();
  const { Organization } = await getMasterModels();
  const orgs = await Organization.find().lean();

  const total = orgs.length;
  const active = orgs.filter((o) => isOrganizationActive(o));
  const trial = orgs.filter((o) => isTrialActive(o));
  const paying = active.filter((o) => !o.plan?.isTrial && o.plan?.tier !== 'free');
  const expired = orgs.filter((o) => o.status === 'expired' || !isOrganizationActive(o));

  const mrr = paying.reduce((s, o) => s + (resolveOrgPlan(o).monthlyPayment || 0), 0);
  const arr = mrr * 12;
  const arpu = paying.length ? Math.round(mrr / paying.length) : 0;

  // Churn: muddati tugagan / jami (sodda ko'rsatkich)
  const churnRate = total ? Math.round((expired.length / total) * 100) : 0;
  // Konversiya: to'lovchi / (to'lovchi + trial)
  const convBase = paying.length + trial.length;
  const conversion = convBase ? Math.round((paying.length / convBase) * 100) : 0;

  // Oxirgi 6 oy — yangi ro'yxatdan o'tganlar
  const now = new Date();
  const buckets: { label: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const count = orgs.filter((o) => o.createdAt && new Date(o.createdAt) >= d && new Date(o.createdAt) < next).length;
    buckets.push({ label: MONTHS_UZ[d.getMonth()], count });
  }
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  // Tariflar bo'yicha taqsimot (faol)
  const byTier = new Map<string, number>();
  for (const o of active) {
    const t = o.plan?.tier || 'free';
    byTier.set(t, (byTier.get(t) || 0) + 1);
  }

  // O'sish foizi (oxirgi oy vs avvalgi)
  const lastM = buckets[buckets.length - 1].count;
  const prevM = buckets[buckets.length - 2]?.count || 0;
  const growth = prevM ? Math.round(((lastM - prevM) / prevM) * 100) : (lastM ? 100 : 0);

  return (
    <>
      <div className="super-page-head">
        <div>
          <h1>Metrikalar</h1>
          <p>Investitsiya va o&apos;sish ko&apos;rsatkichlari</p>
        </div>
      </div>

      <div className="dash-stats">
        <div className="dash-stat dash-stat--ok">
          <div className="dash-stat-n">{fmtMoney(mrr)}</div>
          <div className="dash-stat-l">MRR (oylik daromad, so&apos;m)</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-n">{fmtMoney(arr)}</div>
          <div className="dash-stat-l">ARR (yillik, so&apos;m)</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-n">{fmtMoney(arpu)}</div>
          <div className="dash-stat-l">ARPU (o&apos;rtacha to&apos;lov)</div>
        </div>
        <div className={`dash-stat${growth >= 0 ? ' dash-stat--ok' : ' dash-stat--warn'}`}>
          <div className="dash-stat-n">{growth >= 0 ? '+' : ''}{growth}%</div>
          <div className="dash-stat-l">Oylik o&apos;sish (ro&apos;yxat)</div>
        </div>
      </div>

      <div className="dash-stats">
        <div className="dash-stat"><div className="dash-stat-n">{active.length}</div><div className="dash-stat-l">Faol do&apos;konlar</div></div>
        <div className="dash-stat"><div className="dash-stat-n">{paying.length}</div><div className="dash-stat-l">To&apos;lovchi</div></div>
        <div className="dash-stat"><div className="dash-stat-n">{trial.length}</div><div className="dash-stat-l">Sinovda</div></div>
        <div className="dash-stat dash-stat--warn"><div className="dash-stat-n">{churnRate}%</div><div className="dash-stat-l">Churn (tark etganlar)</div></div>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-head"><h2>O&apos;sish — oxirgi 6 oy (yangi ro&apos;yxat)</h2></div>
        <div className="shot-chart" style={{ height: 200 }}>
          {buckets.map((b) => (
            <div key={b.label} className="shot-chart-col">
              <span style={{ fontSize: '.8rem', fontWeight: 800, color: 'var(--ink-2)' }}>{b.count}</span>
              <div className="shot-chart-bar" style={{ height: `${(b.count / maxCount) * 100}%`, minHeight: 4 }} />
              <span className="shot-chart-m">{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-head"><h2>Trial → to&apos;lov konversiyasi: {conversion}%</h2></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Tarif</th><th>Faol do&apos;konlar</th></tr></thead>
            <tbody>
              {[...byTier.entries()].sort((a, b) => b[1] - a[1]).map(([tier, count]) => (
                <tr key={tier}><td className="cell-main">{tier}</td><td>{count}</td></tr>
              ))}
              {byTier.size === 0 && <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--ink-3)' }}>Ma&apos;lumot yo&apos;q</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
