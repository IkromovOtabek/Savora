import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import { getOrgDisplayStatus } from '@/lib/organizations';
import { isOrganizationActive, isTrialActive, daysUntilExpiry } from '@/lib/models/master/Organization';
import { BUSINESS_TYPES } from '@/lib/businessTypes';
import { resolveOrgPlan, fmtPlanPrice, PLAN_PRESETS } from '@/lib/plans';
import Icon from '@/components/icons/Icon';

export const metadata = { title: 'Super Admin — Savora' };

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
      <div className="super-page-head">
        <div>
          <h1>Platforma boshqaruvi</h1>
          <p>Client bizneslar va tizim funksiyalari — bir joyda</p>
        </div>
        <Link href="/super/organizations/new" className="btn btn-primary">
          <Icon name="plus" size={18} />
          Yangi biznes
        </Link>
      </div>

      <div className="super-stats">
        <div className="super-stat super-stat--brand">
          <Icon name="wallet" size={22} className="super-stat-icon" />
          <strong>{fmtSum(mrr)}</strong><span>MRR (oylik daromad, so&apos;m)</span>
        </div>
        <div className="super-stat super-stat--ok">
          <Icon name="store" size={22} className="super-stat-icon" />
          <strong>{activeCount}</strong><span>Faol biznes</span>
        </div>
        <div className="super-stat">
          <Icon name="building" size={22} className="super-stat-icon" />
          <strong>{orgs.length}</strong>
          <span>Jami biznes</span>
          <em className="super-stat-hint">+{newThisMonth} shu oyda</em>
        </div>
        <div className="super-stat super-stat--brand">
          <Icon name="bell" size={22} className="super-stat-icon" />
          <strong>{trialCount}</strong><span>Sinovda</span>
        </div>
        <div className="super-stat super-stat--warn">
          <Icon name="bell" size={22} className="super-stat-icon" />
          <strong>{expiringSoon.length}</strong><span>7 kunda tugaydi</span>
        </div>
        <div className="super-stat super-stat--danger">
          <Icon name="store" size={22} className="super-stat-icon" />
          <strong>{expiredCount}</strong><span>Muddati tugagan</span>
        </div>
      </div>

      {expiringSoon.length > 0 && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-head"><h2>Tez orada tugaydi (7 kun)</h2></div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Biznes</th><th>Qolgan</th><th>Sana</th><th>To&apos;lov/oy</th><th></th></tr>
              </thead>
              <tbody>
                {expiringSoon.map(({ org, days }) => (
                  <tr key={String(org._id)}>
                    <td>
                      <div className="cell-main">{org.name}{org.plan?.isTrial ? ' · sinov' : ''}</div>
                      <div className="cell-sub">{org.slug}</div>
                    </td>
                    <td>
                      <span className={`badge-status badge-status--${days <= 2 ? 'expired' : 'suspended'}`}>
                        {days === 0 ? 'Bugun' : `${days} kun`}
                      </span>
                    </td>
                    <td>{fmtDate(org.expiresAt)}</td>
                    <td>{fmtPlanPrice(resolveOrgPlan(org).monthlyPayment)}</td>
                    <td className="cell-actions">
                      <Link href={`/super/organizations/${org._id}`} className="btn btn-primary btn-sm">Uzaytirish</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head"><h2>Bizneslar</h2></div>
        {orgs.length === 0 ? (
          <div className="panel-empty">
            <p>Hozircha biznes yo&apos;q.</p>
            <Link href="/super/organizations/new" className="btn btn-primary">Birinchi biznesni yaratish</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Biznes</th>
                  <th>Turi</th>
                  <th>Tarif</th>
                  <th>To&apos;lov/oy</th>
                  <th>Holat</th>
                  <th>Muddat</th>
                  <th></th>
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
                        <div className="cell-main">{org.name}</div>
                        <div className="cell-sub">{org.slug}{org.ownerName ? ` · ${org.ownerName}` : ''}</div>
                      </td>
                      <td>{typeLabel}</td>
                      <td>{plan}</td>
                      <td>{fmtPlanPrice(planInfo.monthlyPayment)}</td>
                      <td><span className={`badge-status badge-status--${st.key}`}>{st.label}</span></td>
                      <td>{fmtDate(org.expiresAt)}</td>
                      <td className="cell-actions">
                        <Link href={`/super/organizations/${org._id}`} className="btn btn-primary btn-sm">Boshqarish</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
