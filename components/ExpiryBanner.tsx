import { resolveOrgPlan } from '@/lib/plans';
import { expiryWarningText, shouldShowExpiryWarning, daysUntilExpiry } from '@/lib/notifications';
import { IOrganization, isTrialActive } from '@/lib/models/master/Organization';
import Icon from '@/components/icons/Icon';

export default function ExpiryBanner({ org }: { org: IOrganization & { _id: string } }) {
  // Sinov (trial) rejimida — butun davr davomida sanoq ko'rsatiladi
  if (isTrialActive(org)) {
    const days = daysUntilExpiry(org.expiresAt);
    const near = days <= 3;
    return (
      <div className={`notify-banner ${near ? 'notify-banner--warn' : 'notify-banner--info'} btn-with-icon`}>
        <Icon name="bell" size={18} className="notify-icon" />
        <div>
          <strong>Bepul sinov:</strong>{' '}
          {days <= 0 ? 'bugun tugaydi' : `${days} kun qoldi`}.
          <div className="notify-sub">
            To&apos;liq imkoniyatlardan foydalanishni davom ettirish uchun tarifni faollashtiring.
          </div>
        </div>
      </div>
    );
  }

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
