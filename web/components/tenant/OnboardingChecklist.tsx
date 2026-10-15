import Link from 'next/link';
import type { IOrganization } from '@/lib/models/master/Organization';
import { onboardingSteps, stepsProgress } from '@/lib/onboardingSteps';
import Icon from '@/components/icons/Icon';
import '@/components/tenant/styles/admin.css';
import './onboarding.css';

/** Asosiy qadamlar bajarilgach cheklist shuncha kundan keyin yashiriladi (ixtiyoriy qadamlar qolgan bo'lsa ham) */
const HIDE_AFTER_DAYS = 14;

interface Props {
  org: Pick<IOrganization, 'onboarding' | 'plan'> &
    Partial<Pick<IOrganization, 'businessType' | 'telegramChatId' | 'users' | 'createdAt'>>;
  features: { products?: boolean; sales?: boolean };
}

export default function OnboardingChecklist({ org, features }: Props) {
  const steps = onboardingSteps(org).filter(
    (s) => (s.id !== 'product' || features.products !== false) && (s.id !== 'sale' || features.sales !== false)
  );
  const progress = stepsProgress(steps);
  if (progress === 100) return null;

  const core = steps.filter((s) => s.id === 'branch' || s.id === 'product' || s.id === 'sale');
  const coreDone = core.every((s) => s.done);
  const ageDays = org.createdAt ? (Date.now() - new Date(org.createdAt).getTime()) / 86_400_000 : 0;
  if (coreDone && ageDays > HIDE_AFTER_DAYS) return null;

  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
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
        <h3 id="ad-onb-title">{coreDone ? 'Deyarli tayyor' : 'Do\'koningizni sozlang'}</h3>
        <p>
          {doneCount} / {steps.length} qadam bajarildi
          {next && <> · keyingisi: <b className="onb-next">{next.label}</b></>}
        </p>
      </div>
      <div className="onb-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Sozlash jarayoni">
        <i style={{ width: `${progress}%` }} />
      </div>
      <ol className="ad-onb-steps onb-steps">
        {steps.map((s, i) => {
          const isNext = next?.id === s.id;
          const inner = (
            <>
              <span className="ad-onb-mark" aria-hidden="true">{s.done ? <Icon name="check" size={14} /> : i + 1}</span>
              <span className="ad-cell-t">
                <b>{s.label}</b>
                <small>{s.done ? 'Bajarildi' : s.hint}</small>
                {!s.done && isNext && s.tip && <small className="onb-tip">{s.tip}</small>}
              </span>
              {!s.done && <Icon name="chevron" size={14} className="ad-onb-go" />}
            </>
          );
          return (
            <li key={s.id}>
              {s.done ? (
                <div className="ad-onb-step ad-onb-step--done">{inner}</div>
              ) : (
                <Link href={s.href} className={`ad-onb-step${isNext ? ' onb-step--next' : ''}`} aria-current={isNext ? 'step' : undefined}>
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      <p className="onb-help">
        Savol bo&apos;lsa — <Link href="/help" className="onb-link">Yordam markazi</Link> yoki Telegram orqali yozing, ko&apos;chirishda bepul yordam beramiz.
      </p>
    </section>
  );
}
