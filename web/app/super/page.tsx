import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import { getOrgDisplayStatus } from '@/lib/organizations';
import { isOrganizationActive, isTrialActive, daysUntilExpiry } from '@/lib/models/master/Organization';
import { BUSINESS_TYPES } from '@/lib/businessTypes';
import { resolveOrgPlan, fmtPlanPrice, PLAN_PRESETS } from '@/lib/plans';
import Icon from '@/components/icons/Icon';
import OrgList, { type OrgListRow } from '@/components/super/OrgList';
import { Avatar, Chevron, HeroStat, Kpi, PageTitle, Pill } from '@/components/super/ui';

export const metadata = { title: "Do'konlar — Super Admin" };

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtSum(n: number) {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(n));
}

export default async function SuperDashboard({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const sp = await searchParams;
  await requireSuperAdmin();
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

  const rows: OrgListRow[] = orgs.map((org) => ({
    id: String(org._id),
    name: org.name,
    slug: org.slug,
    ownerName: org.ownerName ?? '',
    typeLabel: BUSINESS_TYPES[org.businessType as keyof typeof BUSINESS_TYPES]?.label ?? 'Umumiy',
    planLabel: PLAN_PRESETS[org.plan.tier as keyof typeof PLAN_PRESETS]?.label ?? org.plan.tier,
    isTrial: Boolean(org.plan?.isTrial),
    price: fmtPlanPrice(resolveOrgPlan(org).monthlyPayment),
    status: getOrgDisplayStatus(org),
    expires: fmtDate(org.expiresAt),
  }));

  return (
    <>
      <PageTitle title="Do'konlar" sub="Mijoz bizneslar, ularning tarifi va obuna holati — bir joyda" />

      <div className="sa-hero-row">
        <HeroStat
          label="MRR"
          value={fmtSum(mrr)}
          unit="so'm"
          icon="wallet"
          sub="Oylik takroriy daromad"
          items={[
            { label: 'Faol do\'konlar', value: activeCount },
            { label: 'Jami', value: orgs.length },
            { label: 'Shu oyda', value: `+${newThisMonth}` },
          ]}
        />
        <div className="ux-strip sa-strip-3">
          <Kpi label="Sinovda" value={trialCount} icon="clock" tone="c" />
          <Kpi label="7 kunda tugaydi" value={expiringSoon.length} icon="bell" tone="a" />
          <Kpi label="Muddati tugagan" value={expiredCount} icon="alert" tone="r" deltaTone={expiredCount > 0 ? 'bad' : undefined} delta={expiredCount > 0 ? 'Uzaytirish kerak' : undefined} />
        </div>
      </div>

      {expiringSoon.length > 0 && (
        <section className="sa-section">
          <div className="sa-ghead">Tez orada tugaydi · 7 kun</div>
          <div className="sa-group">
            {expiringSoon.map(({ org, days }) => (
              <Link key={String(org._id)} href={`/super/organizations/${org._id}`} className="sa-cell sa-cell--av">
                <Avatar name={org.name} />
                <span className="sa-cell-t">
                  <b>{org.name}{org.plan?.isTrial ? ' · sinov' : ''}</b>
                  <small>{org.slug} · {fmtDate(org.expiresAt)} · {fmtPlanPrice(resolveOrgPlan(org).monthlyPayment)}/oy</small>
                </span>
                <Pill tone={days <= 2 ? 'bad' : 'warn'}>{days === 0 ? 'Bugun' : `${days} kun`}</Pill>
                <Chevron />
              </Link>
            ))}
          </div>
          <div className="sa-gfoot">Do&apos;kon sahifasida muddatni uzaytiring.</div>
        </section>
      )}

      {orgs.length === 0 ? (
        <section className="sa-card">
          <div className="ux-empty">
            <span className="ux-empty-ic"><Icon name="store" size={26} /></span>
            <b>Hozircha do&apos;kon yo&apos;q</b>
            <p>Birinchi mijoz biznesini yarating — havolalar va login avtomatik tayyorlanadi.</p>
            <Link href="/super/organizations/new" className="sa-btn sa-btn--filled">
              <Icon name="plus" size={16} /> Birinchi do&apos;konni yaratish
            </Link>
          </div>
        </section>
      ) : (
        <OrgList rows={rows} initialFilter={sp?.f} />
      )}
    </>
  );
}
