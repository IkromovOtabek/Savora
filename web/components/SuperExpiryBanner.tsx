import Link from 'next/link';
import { getMasterModels } from '@/lib/masterDb';
import { shouldShowExpiryWarning, expiryWarningText } from '@/lib/notifications';
import { resolveOrgPlan } from '@/lib/plans';
import Icon from '@/components/icons/Icon';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';

export default async function SuperExpiryBanner() {
  const { Organization } = await getMasterModels();
  const orgs = await Organization.find({ status: 'active' }).lean();
  const expiring = orgs.filter((o) => shouldShowExpiryWarning(o));

  if (expiring.length === 0) return null;
  const t = (await getDict()).auth.banner;

  return (
    <div className="sa-alert sa-alert--warn" role="status">
      <Icon name="bell" size={18} />
      <div>
        <strong>{t.superTitle}</strong> {tr(t.superText, { n: expiring.length })}
        <ul>
          {expiring.slice(0, 5).map((org) => {
            const plan = resolveOrgPlan(org);
            return (
              <li key={String(org._id)}>
                <Link href={`/super/organizations/${org._id}`}>{org.name}</Link>
                {' — '}
                {expiryWarningText(org, plan.monthlyPayment)}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
