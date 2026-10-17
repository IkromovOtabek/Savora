import { resolveOrgPlan } from '@/lib/plans';
import { expiryWarningText, shouldShowExpiryWarning, daysUntilExpiry } from '@/lib/notifications';
import { IOrganization, isTrialActive } from '@/lib/models/master/Organization';
import Icon from '@/components/icons/Icon';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import '@/components/auth/auth.css';

/** Kabinetdagi to'lov bo'limiga olib boradigan tugma */
function PayButton({ label }: { label: string }) {
  return (
    <a href="#obuna-tolovi" className="au-btn au-btn--filled au-btn--sm" style={{ marginTop: 10 }}>
      <Icon name="wallet" size={15} /> {label}
    </a>
  );
}

export default async function ExpiryBanner({
  org,
  showPayButton = false,
}: {
  org: IOrganization & { _id: string };
  /** Admin bo'lsa — "To'lash" tugmasi ko'rsatiladi (to'lov bo'limiga o'tadi) */
  showPayButton?: boolean;
}) {
  const d = await getDict();
  const t = d.auth.banner;
  // Sinov (trial) rejimida — butun davr davomida sanoq ko'rsatiladi
  if (isTrialActive(org)) {
    const days = daysUntilExpiry(org.expiresAt);
    const near = days <= 3;
    return (
      <div className={`au-alert ${near ? 'au-alert--warn' : 'au-alert--info'}`} role="status">
        <Icon name="bell" size={18} />
        <div>
          <strong>{t.trial}</strong>{' '}
          {days <= 0 ? t.endsToday : tr(t.daysLeft, { n: days })}.
          <div style={{ marginTop: 4, fontWeight: 400, opacity: .9 }}>
            {t.activatePlan}
          </div>
          {showPayButton && <PayButton label={t.pay} />}
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
        <strong>{t.reminder}</strong> {text}
        {org.plan.agreementNote && (
          <div style={{ marginTop: 4, fontWeight: 400, opacity: .9 }}>{t.agreement} {org.plan.agreementNote}</div>
        )}
        {showPayButton ? (
          <PayButton label={t.pay} />
        ) : (
          plan.monthlyPayment > 0 && (
            <div style={{ marginTop: 4, fontWeight: 400, opacity: .9 }}>{t.contactOwner}</div>
          )
        )}
      </div>
    </div>
  );
}
