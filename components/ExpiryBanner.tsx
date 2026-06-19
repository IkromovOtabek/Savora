import { resolveOrgPlan } from '@/lib/plans';
import { expiryWarningText, shouldShowExpiryWarning } from '@/lib/notifications';
import { IOrganization } from '@/lib/models/master/Organization';
import Icon from '@/components/icons/Icon';

export default function ExpiryBanner({ org }: { org: IOrganization & { _id: string } }) {
  if (!shouldShowExpiryWarning(org)) return null;

  const plan = resolveOrgPlan(org);
  const text = expiryWarningText(org, plan.monthlyPayment);

  return (
    <div className="notify-banner notify-banner--warn btn-with-icon">
      <Icon name="bell" size={18} className="notify-icon" />
      <div>
        <strong>Eslatma:</strong> {text}
      {org.plan.agreementNote && (
        <div className="notify-sub">Kelishuv: {org.plan.agreementNote}</div>
      )}
      {plan.monthlyPayment > 0 && (
        <div className="notify-sub">To&apos;lov uchun platforma egasiga murojaat qiling.</div>
      )}
      </div>
    </div>
  );
}
