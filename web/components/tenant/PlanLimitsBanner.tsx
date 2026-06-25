import Link from 'next/link';
import { checkPlanLimits, resolveOrgPlan } from '@/lib/plans';
import { IOrganization } from '@/lib/models/master/Organization';

interface Props {
  org: Pick<IOrganization, 'plan'>;
  current: { users: number; branches: number; products: number };
}

export default function PlanLimitsBanner({ org, current }: Props) {
  const plan = resolveOrgPlan({ plan: org.plan });
  const limits = checkPlanLimits(plan, current);

  const warnings: string[] = [];
  if (limits.usersPercent >= 80) warnings.push(`Xodimlar: ${current.users}/${plan.maxUsers}`);
  if (limits.branchesPercent >= 80) warnings.push(`Filiallar: ${current.branches}/${plan.maxFilial}`);
  if (limits.productsPercent >= 80) warnings.push(`Mahsulotlar: ${current.products}/${plan.maxProducts}`);

  if (warnings.length === 0) return null;

  return (
    <div className="plan-limit-banner">
      <span className="plan-limit-icon">⚠️</span>
      <div className="plan-limit-body">
        <strong>Limit yaqinlashmoqda:</strong> {warnings.join(' · ')}
      </div>
      <Link href="/app/profile#plan" className="btn btn-sm btn-primary">Tarifni yangilash</Link>
    </div>
  );
}
