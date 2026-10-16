'use client';

import { useActionState } from 'react';
import { updatePlatformPlansAction } from '@/app/actions/plans';
import { PlanPreset } from '@/lib/plans';
import { fmtPlanPrice } from '@/lib/plans';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import PriceInput from '@/components/ui/PriceInput';
import { Alert, Sq, type SqTone } from './ui';

interface Props {
  presets: Record<'starter' | 'pro' | 'business', PlanPreset>;
}

const TIER_TONE: Record<'starter' | 'pro' | 'business', SqTone> = { starter: 'c', pro: 'b', business: 'v' };

export default function PlansSettingsForm({ presets }: Props) {
  const [state, formAction, isPending] = useActionState(updatePlatformPlansAction, null);
  const d = useDict();
  const s = d.superPanel.plans;
  const priceLabels = { free: d.superPanel.free, sum: d.common.sum };

  return (
    <form action={formAction} className="sa-form">
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.success && <Alert tone="ok">{state.success}</Alert>}

      <p className="sa-gfoot" style={{ padding: 0 }}>{s.intro}</p>

      <div className="sa-plans">
      {(['starter', 'pro', 'business'] as const).map((tier) => {
        const p = presets[tier];
        return (
          <section key={tier} className="sa-card">
            <div className="sa-card-h" style={{ alignItems: 'center' }}>
              <div className="sa-subhead">
                <Sq icon="plans" tone={TIER_TONE[tier]} />
                <div>
                  {/* Nomi — bazadagi tahrirlanadigan qiymat (admin kiritgan matn) */}
                  <h3>{p.label}</h3>
                  <p>{fmtPlanPrice(p.monthlyPrice, priceLabels)}{p.monthlyPrice > 0 ? d.superPanel.perMonth : ''} · {tr(s.limits, { filial: p.maxFilial, users: p.maxUsers })}</p>
                </div>
              </div>
            </div>
            <div className="sa-fields sa-card-b">
              <div className="sa-grid-2">
                <div className="sa-field">
                  <label htmlFor={`${tier}_label`}>{d.common.name}</label>
                  <input id={`${tier}_label`} name={`${tier}_label`} type="text" defaultValue={p.label} disabled={isPending} />
                </div>
                <div className="sa-field">
                  <label htmlFor={`${tier}_description`}>{d.common.description}</label>
                  <input id={`${tier}_description`} name={`${tier}_description`} type="text" defaultValue={p.description} disabled={isPending} />
                </div>
              </div>
              <div className="sa-grid-3">
                <div className="sa-field">
                  <label htmlFor={`${tier}_maxFilial`}>{s.branchCount}</label>
                  <input id={`${tier}_maxFilial`} name={`${tier}_maxFilial`} type="number" min={1} defaultValue={p.maxFilial} disabled={isPending} />
                </div>
                <div className="sa-field">
                  <label htmlFor={`${tier}_maxUsers`}>{s.userCount}</label>
                  <input id={`${tier}_maxUsers`} name={`${tier}_maxUsers`} type="number" min={1} defaultValue={p.maxUsers} disabled={isPending} />
                </div>
                <div className="sa-field">
                  <label htmlFor={`${tier}_monthlyPrice`}>{s.monthlySum}</label>
                  <PriceInput id={`${tier}_monthlyPrice`} name={`${tier}_monthlyPrice`} defaultValue={p.monthlyPrice} disabled={isPending} />
                </div>
              </div>
            </div>
          </section>
        );
      })}
      </div>

      <Alert tone="info">
        <strong>{s.customTitle}</strong> {s.customText}
      </Alert>

      <div className="sa-form-actions">
        <button type="submit" className="sa-btn sa-btn--filled sa-btn--lg" disabled={isPending}>
          {isPending ? d.common.saving : s.save}
        </button>
      </div>
    </form>
  );
}
