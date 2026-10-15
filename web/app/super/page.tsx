import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import { getOrgDisplayStatus } from '@/lib/organizations';
import { isOrganizationActive, isTrialActive, daysUntilExpiry } from '@/lib/models/master/Organization';
import { BUSINESS_TYPES } from '@/lib/businessTypes';
import { resolveOrgPlan, fmtPlanPrice, PLAN_PRESETS } from '@/lib/plans';
import Icon from '@/components/icons/Icon';
import { Avatar, Chevron, Kpi, OrgStatusPill, PageTitle, Pill } from '@/components/super/ui';

export const metadata = { title: "Do'konlar — Super Admin" };

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtSum(n: number) {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(n));
}

export default async function SuperDashboard() {
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

  return (
    <>
      <PageTitle title="Do'konlar" sub="Mijoz bizneslar, ularning tarifi va obuna holati — bir joyda" />

      <div className="sa-kpis sa-kpis--6">
        <Kpi hero label="MRR" value={fmtSum(mrr)} unit="so'm" icon="wallet" delta="Oylik takroriy daromad" />
        <Kpi label="Faol" value={activeCount} icon="store" tone="o" />
        <Kpi label="Jami" value={orgs.length} icon="building" tone="b" delta={`+${newThisMonth} shu oyda`} deltaTone={newThisMonth > 0 ? 'ok' : undefined} />
        <Kpi label="Sinovda" value={trialCount} icon="clock" tone="c" />
        <Kpi label="7 kunda tugaydi" value={expiringSoon.length} icon="bell" tone="a" />
        <Kpi label="Muddati tugagan" value={expiredCount} icon="alert" tone="r" />
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

      <section className="sa-card">
        <div className="sa-card-h">
          <div>
            <h2>Barcha do&apos;konlar</h2>
            <p>{orgs.length} ta biznes</p>
          </div>
        </div>
        {orgs.length === 0 ? (
          <div className="sa-empty">
            <p>Hozircha do&apos;kon yo&apos;q.</p>
            <Link href="/super/organizations/new" className="sa-btn sa-btn--filled">
              <Icon name="plus" size={16} /> Birinchi do&apos;konni yaratish
            </Link>
          </div>
        ) : (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Do&apos;kon</th>
                  <th>Turi</th>
                  <th>Tarif</th>
                  <th className="sa-td-r">To&apos;lov/oy</th>
                  <th>Holat</th>
                  <th>Muddat</th>
                  <th aria-label="Amallar" />
                </tr>
              </thead>
              <tbody>
                {orgs.map((org) => {
                  const st = getOrgDisplayStatus(org);
                  const planInfo = resolveOrgPlan(org);
                  const plan = PLAN_PRESETS[org.plan.tier as keyof typeof PLAN_PRESETS]?.label ?? org.plan.tier;
                  const typeLabel = BUSINESS_TYPES[org.businessType as keyof typeof BUSINESS_TYPES]?.label ?? 'Umumiy';
                  return (
                    <tr key={String(org._id)}>
                      <td>
                        <Link href={`/super/organizations/${org._id}`} className="sa-td-main">{org.name}</Link>
                        <span className="sa-td-sub">{org.slug}{org.ownerName ? ` · ${org.ownerName}` : ''}</span>
                      </td>
                      <td>{typeLabel}</td>
                      <td>{plan}{org.plan?.isTrial ? <> <Pill tone="br">sinov</Pill></> : null}</td>
                      <td className="sa-td-r">{fmtPlanPrice(planInfo.monthlyPayment)}</td>
                      <td><OrgStatusPill status={st} /></td>
                      <td>{fmtDate(org.expiresAt)}</td>
                      <td className="sa-td-r">
                        <Link href={`/super/organizations/${org._id}`} className="sa-btn sa-btn--tinted sa-btn--sm">Boshqarish</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
