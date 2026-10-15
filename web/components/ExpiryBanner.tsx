import { resolveOrgPlan } from '@/lib/plans';
import { expiryWarningText, shouldShowExpiryWarning, daysUntilExpiry } from '@/lib/notifications';
import { IOrganization, isTrialActive } from '@/lib/models/master/Organization';
import Icon from '@/components/icons/Icon';
import '@/components/auth/auth.css';

/** Kabinetdagi to'lov bo'limiga olib boradigan tugma */
function PayButton() {
  return (
    <a href="#obuna-tolovi" className="au-btn au-btn--filled au-btn--sm" style={{ marginTop: 10 }}>
      <Icon name="wallet" size={15} /> To&apos;lash
    </a>
  );
}

export default function ExpiryBanner({
  org,
  showPayButton = false,
}: {
  org: IOrganization & { _id: string };
  /** Admin bo'lsa — "To'lash" tugmasi ko'rsatiladi (to'lov bo'limiga o'tadi) */
  showPayButton?: boolean;
}) {
  // Sinov (trial) rejimida — butun davr davomida sanoq ko'rsatiladi
  if (isTrialActive(org)) {
    const days = daysUntilExpiry(org.expiresAt);
    const near = days <= 3;
    return (
      <div className={`au-alert ${near ? 'au-alert--warn' : 'au-alert--info'}`} role="status">
        <Icon name="bell" size={18} />
        <div>
          <strong>Bepul sinov:</strong>{' '}
          {days <= 0 ? 'bugun tugaydi' : `${days} kun qoldi`}.
          <div style={{ marginTop: 4, fontWeight: 400, opacity: .9 }}>
            To&apos;liq imkoniyatlardan foydalanishni davom ettirish uchun tarifni faollashtiring.
          </div>
          {showPayButton && <PayButton />}
        </div>
      </div>
    );
  }

  if (!shouldShowExpiryWarning(org)) return null;

  const plan = resolveOrgPlan(org);
  const text = expiryWarningText(org, plan.monthlyPayment);

  return (
    <div className="au-alert au-alert--warn" role="status">
      <Icon name="bell" size={18} />
      <div>
        <strong>Eslatma:</strong> {text}
        {org.plan.agreementNote && (
          <div style={{ marginTop: 4, fontWeight: 400, opacity: .9 }}>Kelishuv: {org.plan.agreementNote}</div>
        )}
        {showPayButton ? (
          <PayButton />
        ) : (
          plan.monthlyPayment > 0 && (
            <div style={{ marginTop: 4, fontWeight: 400, opacity: .9 }}>To&apos;lov uchun platforma egasiga murojaat qiling.</div>
          )
        )}
      </div>
    </div>
  );
}
