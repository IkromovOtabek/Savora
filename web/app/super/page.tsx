import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import { getOrgDisplayStatus } from '@/lib/organizations';
import { isOrganizationActive, isTrialActive, daysUntilExpiry } from '@/lib/models/master/Organization';
import { isBusinessType } from '@/lib/businessTypes';
import { resolveOrgPlan, fmtPlanPrice, type PlanTier } from '@/lib/plans';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import Icon from '@/components/icons/Icon';
import OrgList, { type OrgListRow } from '@/components/super/OrgList';
import { Avatar, Chevron, HeroStat, Kpi, PageTitle, Pill } from '@/components/super/ui';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.superPanel.orgs.metaTitle };
}

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtSum(n: number) {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(n));
}

export default async function SuperDashboard({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const sp = await searchParams;
  await requireSuperAdmin();
  const d = await getDict();
  const s = d.superPanel;
  const priceLabels = { free: s.free, sum: d.common.sum };
  const { Organization } = await getMasterModels();
  const orgs = await Organization.find().sort({ createdAt: -1 }).lean();

  // ---- Analitika ----
  const active = orgs.filter((o) => isOrganizationActive(o));
  const activeCount = active.length;
  const trialCount = orgs.filter((o) => isTrialActive(o)).length;
  // MRR — faol, to'lovchi (trial bo'lmagan) bizneslarning oylik to'lovi yig'indisi
  const mrr = active
    .filter((o) => !o.plan?.isTrial)
    .reduce((sum, o) => sum + (resolveOrgPlan(o).monthlyPayment || 0), 0);
  // 7 kun ichida muddati tugaydiganlar
  const expiringSoon = active
    .map((o) => ({ org: o, days: daysUntilExpiry(o) }))
    .filter((x) => x.days >= 0 && x.days <= 7)
    .sort((a, b) => a.days - b.days);
  const expiredCount = orgs.filter((o) => o.status === 'expired' || !isOrganizationActive(o)).length;
  // Shu oyda qo'shilganlar
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const newThisMonth = orgs.filter((o) => o.createdAt && new Date(o.createdAt) >= monthStart).length;

  const rows: OrgListRow[] = orgs.map((org) => {
    const st = getOrgDisplayStatus(org);
    const plan = resolveOrgPlan(org);
    return {
      id: String(org._id),
      name: org.name,
      slug: org.slug,
      ownerName: org.ownerName ?? '',
      typeLabel: d.catalog.businessTypes[isBusinessType(org.businessType) ? org.businessType : 'general'].label,
      planLabel: d.catalog.planTiers[plan.tier as PlanTier] ?? org.plan.tier,
      isTrial: Boolean(org.plan?.isTrial),
      price: fmtPlanPrice(plan.monthlyPayment, priceLabels),
      status: { key: st.key, label: s.status[st.key] },
      expires: fmtDate(org.expiresAt),
    };
  });

  return (
    <>
      <PageTitle title={s.orgs.title} sub={s.orgs.sub} />

      <div className="sa-hero-row">
        <HeroStat
          label={s.mrr}
          value={fmtSum(mrr)}
          unit={d.common.sum}
          icon="wallet"
          sub={s.mrrSub}
          items={[
            { label: s.activeStores, value: activeCount },
            { label: d.common.total, value: orgs.length },
            { label: s.orgs.thisMonth, value: `+${newThisMonth}` },
          ]}
        />
        <div className="ux-strip sa-strip-3">
          <Kpi label={s.orgs.inTrial} value={trialCount} icon="clock" tone="c" />
          <Kpi label={s.orgs.expires7} value={expiringSoon.length} icon="bell" tone="a" />
          <Kpi label={s.orgs.expired} value={expiredCount} icon="alert" tone="r" deltaTone={expiredCount > 0 ? 'bad' : undefined} delta={expiredCount > 0 ? s.orgs.needExtend : undefined} />
        </div>
      </div>

      {expiringSoon.length > 0 && (
        <section className="sa-section">
          <div className="sa-ghead">{s.expiringSoon7}</div>
          <div className="sa-group">
            {expiringSoon.map(({ org, days }) => (
              <Link key={String(org._id)} href={`/super/organizations/${org._id}`} className="sa-cell sa-cell--av">
                <Avatar name={org.name} />
                <span className="sa-cell-t">
                  <b>{org.name}{org.plan?.isTrial ? ` · ${s.trial}` : ''}</b>
                  <small>{org.slug} · {fmtDate(org.expiresAt)} · {fmtPlanPrice(resolveOrgPlan(org).monthlyPayment, priceLabels)}{s.perMonth}</small>
                </span>
                <Pill tone={days <= 2 ? 'bad' : 'warn'}>{days === 0 ? d.common.today : tr(d.common.nDays, { n: days })}</Pill>
                <Chevron />
              </Link>
            ))}
          </div>
          <div className="sa-gfoot">{s.orgs.extendHint}</div>
        </section>
      )}

      {orgs.length === 0 ? (
        <section className="sa-card">
          <div className="ux-empty">
            <span className="ux-empty-ic"><Icon name="store" size={26} /></span>
            <b>{s.orgs.emptyTitle}</b>
            <p>{s.orgs.emptyText}</p>
            <Link href="/super/organizations/new" className="sa-btn sa-btn--filled">
              <Icon name="plus" size={16} /> {s.orgs.createFirst}
            </Link>
          </div>
        </section>
      ) : (
        <OrgList rows={rows} initialFilter={sp?.f} />
      )}
    </>
  );
}
