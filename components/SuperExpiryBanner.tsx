import Link from 'next/link';
import { getMasterModels } from '@/lib/masterDb';
import { shouldShowExpiryWarning, expiryWarningText } from '@/lib/notifications';
import { resolveOrgPlan } from '@/lib/plans';
import Icon from '@/components/icons/Icon';

export default async function SuperExpiryBanner() {
  const { Organization } = await getMasterModels();
  const orgs = await Organization.find({ status: 'active' }).lean();
  const expiring = orgs.filter((o) => shouldShowExpiryWarning(o));

  if (expiring.length === 0) return null;

  return (
    <div className="notify-banner notify-banner--warn btn-with-icon">
      <Icon name="bell" size={18} className="notify-icon" />
      <div>
        <strong>Obuna eslatmasi:</strong> {expiring.length} ta biznes obunasi 2 kun ichida tugaydi.
      <ul className="notify-list">
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
