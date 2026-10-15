import { requireSuperAdmin } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import { isOrganizationActive, isTrialActive } from '@/lib/models/master/Organization';
import { resolveOrgPlan, PLAN_PRESETS } from '@/lib/plans';
import { fmtMoney } from '@/lib/format';
import { Kpi, PageTitle } from '@/components/super/ui';

export const metadata = { title: 'Metrikalar — Super Admin' };

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
  const activeTotal = active.length || 1;

  return (
    <>
      <PageTitle title="Metrikalar" sub="Daromad, o'sish va konversiya ko'rsatkichlari" />

      <div className="sa-kpis">
        <Kpi hero label="MRR" value={fmtMoney(mrr)} unit="so'm" icon="wallet" delta="Oylik takroriy daromad" />
        <Kpi label="ARR" value={fmtMoney(arr)} unit="so'm" icon="chart" tone="b" delta="Yillik daromad (MRR × 12)" />
        <Kpi label="ARPU" value={fmtMoney(arpu)} unit="so'm" icon="user" tone="v" delta="O'rtacha to'lov (bir do'kon)" />
        <Kpi
          label="Oylik o'sish"
          value={`${growth >= 0 ? '+' : ''}${growth}%`}
          icon="trendingUp"
          tone={growth >= 0 ? 'o' : 'r'}
          delta="Yangi ro'yxatlar, o'tgan oyga nisbatan"
          deltaTone={growth >= 0 ? 'ok' : 'bad'}
        />
      </div>

      <div className="sa-kpis">
        <div className="sa-card sa-mini"><span>Faol do&apos;konlar</span><b>{active.length}</b></div>
        <div className="sa-card sa-mini"><span>To&apos;lovchi</span><b>{paying.length}</b></div>
        <div className="sa-card sa-mini"><span>Sinovda</span><b>{trial.length}</b></div>
        <div className="sa-card sa-mini"><span>Tark etganlar (churn)</span><b style={{ color: churnRate > 0 ? 'var(--warn, #a0650a)' : undefined }}>{churnRate}%</b></div>
      </div>

      <div className="sa-two">
        <section className="sa-card">
          <div className="sa-card-h">
            <div>
              <h2>O&apos;sish · oxirgi 6 oy</h2>
              <p>Har oy yangi ro&apos;yxatdan o&apos;tgan do&apos;konlar</p>
            </div>
          </div>
          <div className="sa-bars" role="img" aria-label="Oxirgi 6 oylik yangi ro'yxatlar grafigi">
            {buckets.map((b, i) => (
              <div key={`${b.label}-${i}`} className="sa-bar">
                <span className="sa-bar-v">{b.count}</span>
                <div className="sa-bar-track">
                  <div className="sa-bar-fill" style={{ height: `${(b.count / maxCount) * 100}%` }} />
                </div>
                <span className="sa-bar-l">{b.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="sa-section">
          <div className="sa-ghead">Sinov → to&apos;lov konversiyasi</div>
          <div className="sa-group">
            <div className="sa-cell">
              <span className="sa-cell-t"><b>Konversiya</b><small>To&apos;lovchi / (to&apos;lovchi + sinovda)</small></span>
              <span className="sa-cell-v"><b>{conversion}%</b></span>
            </div>
          </div>
          <div className="sa-ghead" style={{ marginTop: 14 }}>Faol do&apos;konlar · tarif bo&apos;yicha</div>
          <div className="sa-group">
            {[...byTier.entries()].sort((a, b) => b[1] - a[1]).map(([tier, count]) => (
              <div key={tier} className="sa-cell">
                <span className="sa-cell-t">
                  <b>{PLAN_PRESETS[tier as keyof typeof PLAN_PRESETS]?.label ?? tier}</b>
                  <span className="sa-prog" style={{ marginTop: 6 }}><i style={{ width: `${Math.round((count / activeTotal) * 100)}%` }} /></span>
                </span>
                <span className="sa-cell-v">{count}</span>
              </div>
            ))}
            {byTier.size === 0 && <div className="sa-empty">Ma&apos;lumot yo&apos;q</div>}
          </div>
        </section>
      </div>
    </>
  );
}
