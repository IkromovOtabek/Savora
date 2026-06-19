import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import { getOrgDisplayStatus } from '@/lib/organizations';
import { isOrganizationActive } from '@/lib/models/master/Organization';
import { BUSINESS_TYPES } from '@/lib/businessTypes';
import { resolveOrgPlan, fmtPlanPrice, PLAN_PRESETS } from '@/lib/plans';
import Icon from '@/components/icons/Icon';

export const metadata = { title: 'Super Admin — Savora' };

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default async function SuperDashboard() {
  await requireSuperAdmin();
  const { Organization } = await getMasterModels();
  const orgs = await Organization.find().sort({ createdAt: -1 }).lean();
  const activeCount = orgs.filter((o) => isOrganizationActive(o)).length;

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
        <div className="super-stat">
          <Icon name="building" size={22} className="super-stat-icon" />
          <strong>{orgs.length}</strong><span>Jami biznes</span>
        </div>
        <div className="super-stat super-stat--ok">
          <Icon name="store" size={22} className="super-stat-icon" />
          <strong>{activeCount}</strong><span>Faol</span>
        </div>
      </div>

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
