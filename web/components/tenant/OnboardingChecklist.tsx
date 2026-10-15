import Link from 'next/link';
import { IOrganization, isOnboardingComplete, onboardingProgress } from '@/lib/models/master/Organization';
import Icon from '@/components/icons/Icon';
import '@/components/tenant/styles/admin.css';

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
      href: '/app/users#filial',
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

  const doneCount = steps.filter((s) => s.done).length;
  const r = 22;
  const c = 2 * Math.PI * r;

  return (
    <section className="ad-group ad-onb" aria-labelledby="ad-onb-title">
      <div className="ad-ring ad-ring--sm" role="img" aria-label={`${progress}% bajarildi`}>
        <svg viewBox="0 0 56 56" aria-hidden="true">
          <circle className="ad-ring-track" cx="28" cy="28" r={r} fill="none" strokeWidth="6" />
          <circle
            className="ad-ring-val"
            cx="28" cy="28" r={r} fill="none" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - progress / 100)}
          />
        </svg>
        <div className="ad-ring-c" aria-hidden="true"><b>{progress}%</b></div>
      </div>
      <div className="ad-onb-head">
        <h3 id="ad-onb-title">Do&apos;koningizni sozlang</h3>
        <p>{doneCount} / {steps.length} qadam bajarildi — qolganlari bir necha daqiqa oladi</p>
      </div>
      <ol className="ad-onb-steps">
        {steps.map((s, i) => {
          const inner = (
            <>
              <span className="ad-onb-mark" aria-hidden="true">{s.done ? <Icon name="check" size={14} /> : i + 1}</span>
              <span className="ad-cell-t">
                <b>{s.label}</b>
                <small>{s.done ? 'Bajarildi' : s.hint}</small>
              </span>
              {!s.done && <Icon name="chevron" size={14} className="ad-onb-go" />}
            </>
          );
          return (
            <li key={s.href}>
              {s.done ? (
                <div className="ad-onb-step ad-onb-step--done">{inner}</div>
              ) : (
                <Link href={s.href} className="ad-onb-step">{inner}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
