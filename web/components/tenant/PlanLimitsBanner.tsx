import Link from 'next/link';
import { checkPlanLimits, resolveOrgPlan } from '@/lib/plans';
import { IOrganization } from '@/lib/models/master/Organization';
import Icon from '@/components/icons/Icon';
import { getDict } from '@/lib/i18n/server';
import '@/components/tenant/styles/admin.css';

interface Props {
  org: Pick<IOrganization, 'plan'>;
  current: { users: number; branches: number; products: number };
}

export default async function PlanLimitsBanner({ org, current }: Props) {
  const d = await getDict();
  const plan = resolveOrgPlan({ plan: org.plan });
  const limits = checkPlanLimits(plan, current);

  const meters: { label: string; used: number; max: number; pct: number }[] = [];
  if (limits.usersPercent >= 80) meters.push({ label: d.shell.planLimits.users, used: current.users, max: plan.maxUsers, pct: limits.usersPercent });
  if (limits.branchesPercent >= 80) meters.push({ label: d.common.branches, used: current.branches, max: plan.maxFilial, pct: limits.branchesPercent });
  if (limits.productsPercent >= 80) meters.push({ label: d.common.products, used: current.products, max: plan.maxProducts, pct: limits.productsPercent });

  if (meters.length === 0) return null;

  return (
    <div className="ad-limit" role="status">
      <span className="ad-sq ad-sq--gold" aria-hidden="true"><Icon name="alert" size={16} /></span>
      <div className="ad-limit-body">
        <p className="ad-limit-title">{d.shell.planLimits.title}</p>
        <div className="ad-limit-meters">
          {meters.map((m) => (
            <div
              key={m.label}
              className={`ad-meter ${m.pct >= 100 ? 'ad-meter--over' : 'ad-meter--warn'}`}
              role="meter"
              aria-label={m.label}
              aria-valuemin={0}
              aria-valuemax={m.max}
              aria-valuenow={m.used}
            >
              <div className="ad-meter-top"><span>{m.label}</span><b>{m.used} / {m.max}</b></div>
              <div className="ad-meter-bar"><div className="ad-meter-fill" style={{ width: `${m.pct}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
      <Link href="/app/profile#obuna-tolovi" className="btn btn-sm btn-tinted">{d.shell.planLimits.upgrade}</Link>
    </div>
  );
}
