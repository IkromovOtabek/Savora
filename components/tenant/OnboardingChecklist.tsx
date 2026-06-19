import Link from 'next/link';
import { IOrganization, isOnboardingComplete, onboardingProgress } from '@/lib/models/master/Organization';

interface Props {
  org: Pick<IOrganization, 'onboarding' | 'plan'>;
  features: { products?: boolean; sales?: boolean };
}

export default function OnboardingChecklist({ org, features }: Props) {
  if (isOnboardingComplete(org)) return null;

  const o = org.onboarding ?? {};
  const progress = onboardingProgress(org);

  const steps: { done: boolean; label: string; href: string; hint: string }[] = [
    {
      done: !!o.branchCreated,
      label: 'Filial yarating',
      href: '/app/branches',
      hint: 'Do\'koningizning asosiy filialini sozlang',
    },
    {
      done: !!o.productAdded,
      label: 'Birinchi mahsulot qo\'shing',
      href: '/app/products/new',
      hint: 'Omborga kamida bitta tovar kiriting',
    },
    {
      done: !!o.saleMade,
      label: 'Birinchi sotuv',
      href: '/app/sales/new',
      hint: 'Birinchi sotuvingizni amalga oshiring',
    },
  ];

  return (
    <div className="onboarding-card">
      <div className="onboarding-head">
        <div>
          <h3 className="onboarding-title">Do&apos;koningizni sozlang</h3>
          <p className="onboarding-sub">{progress}% bajarildi</p>
        </div>
        <div className="onboarding-bar-wrap">
          <div className="onboarding-bar" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="onboarding-steps">
        {steps.map((s, i) => (
          <div key={i} className={`onboarding-step${s.done ? ' onboarding-step--done' : ''}`}>
            <div className="onboarding-check">{s.done ? '✓' : i + 1}</div>
            <div className="onboarding-step-body">
              <div className="onboarding-step-label">{s.label}</div>
              <div className="onboarding-step-hint">{s.hint}</div>
            </div>
            {!s.done && (
              <Link href={s.href} className="btn btn-ghost btn-sm">Boshlash</Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
