import { requireSuperAdmin } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import { isOrganizationActive, isTrialActive } from '@/lib/models/master/Organization';
import { resolveOrgPlan, parsePlanTier } from '@/lib/plans';
import { fmtMoney } from '@/lib/format';
import { getI18n } from '@/lib/i18n/server';
import { MONTHS_SHORT, tr } from '@/lib/i18n/fmt';
import { HeroStat, Kpi, PageTitle } from '@/components/super/ui';

export async function generateMetadata() {
  const { d } = await getI18n();
  return { title: d.superPanel.metrics.metaTitle };
}

export default async function SuperMetricsPage() {
  await requireSuperAdmin();
  const { locale, d } = await getI18n();
  const s = d.superPanel.metrics;
  const { Organization } = await getMasterModels();
  const orgs = await Organization.find().lean();

  const total = orgs.length;
  const active = orgs.filter((o) => isOrganizationActive(o));
  const trial = orgs.filter((o) => isTrialActive(o));
  const paying = active.filter((o) => !o.plan?.isTrial && o.plan?.tier !== 'free');
  const expired = orgs.filter((o) => o.status === 'expired' || !isOrganizationActive(o));

  const mrr = paying.reduce((sum, o) => sum + (resolveOrgPlan(o).monthlyPayment || 0), 0);
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
    const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const count = orgs.filter((o) => o.createdAt && new Date(o.createdAt) >= from && new Date(o.createdAt) < next).length;
    buckets.push({ label: MONTHS_SHORT[locale][from.getMonth()], count });
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
      <PageTitle title={s.title} sub={s.sub} />

      <div className="sa-hero-row">
        <HeroStat
          label={d.superPanel.mrr}
          value={fmtMoney(mrr)}
          unit={d.common.sum}
          icon="wallet"
          sub={d.superPanel.mrrSub}
          items={[
            { label: s.arr, value: fmtMoney(arr) },
            { label: s.paying, value: paying.length },
            { label: s.inTrial, value: trial.length },
          ]}
        />
        <div className="ux-strip sa-strip-3">
          <Kpi label={s.arpu} value={fmtMoney(arpu)} unit={d.common.sum} icon="user" tone="v" delta={s.arpuSub} />
          <Kpi
            label={s.monthlyGrowth}
            value={`${growth >= 0 ? '+' : ''}${growth}%`}
            icon="trendingUp"
            tone={growth >= 0 ? 'o' : 'r'}
            delta={s.growthSub}
            deltaTone={growth >= 0 ? 'ok' : 'bad'}
          />
          <Kpi
            label={s.churn}
            value={`${churnRate}%`}
            icon="alert"
            tone={churnRate > 0 ? 'a' : 'g'}
            delta={tr(s.churnSub, { n: expired.length })}
            deltaTone={churnRate > 0 ? 'warn' : undefined}
          />
        </div>
      </div>

      <div className="sa-two">
        <section className="sa-card">
          <div className="sa-card-h">
            <div>
              <h2>{s.growthTitle}</h2>
              <p>{s.growthText}</p>
            </div>
          </div>
          <div className="sa-bars sa-bars--3d" role="img" aria-label={s.growthAria}>
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
          <div className="sa-ghead">{s.conversionTitle}</div>
          <div className="sa-group">
            <div className="sa-cell">
              <span className="sa-cell-t"><b>{s.conversion}</b><small>{s.conversionFormula}</small></span>
              <span className="sa-cell-v"><b>{conversion}%</b></span>
            </div>
          </div>
          <div className="sa-ghead" style={{ marginTop: 14 }}>{s.activeByPlan} <span>{active.length}</span></div>
          <div className="sa-group">
            {[...byTier.entries()].sort((a, b) => b[1] - a[1]).map(([tier, count]) => (
              <div key={tier} className="sa-cell">
                <span className="sa-cell-t">
                  <b>{d.catalog.planTiers[parsePlanTier(tier)]}</b>
                  <span className="sa-prog" style={{ marginTop: 6 }}><i style={{ width: `${Math.round((count / activeTotal) * 100)}%` }} /></span>
                </span>
                <span className="sa-cell-v">{count}</span>
              </div>
            ))}
            {byTier.size === 0 && <div className="sa-empty">{d.common.noData}</div>}
          </div>
        </section>
      </div>
    </>
  );
}
