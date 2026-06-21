'use client';

import { useActionState } from 'react';
import { updatePlatformPlansAction } from '@/app/actions/plans';
import { PlanPreset } from '@/lib/plans';
import { fmtPlanPrice } from '@/lib/plans';
import PriceInput from '@/components/ui/PriceInput';

interface Props {
  presets: Record<'starter' | 'pro' | 'business', PlanPreset>;
}

export default function PlansSettingsForm({ presets }: Props) {
  const [state, formAction, isPending] = useActionState(updatePlatformPlansAction, null);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Standart tariflar</h2>
        <p className="panel-sub">Bu qiymatlar yangi biznes yaratishda va marketing sahifasida ko&apos;rinadi. Har bir biznes uchun alohida qo&apos;lda ham o&apos;zgartirish mumkin.</p>
      </div>

      {state?.error && <div className="auth-alert auth-alert--error panel-alert">{state.error}</div>}
      {state?.success && <div className="auth-alert auth-alert--info panel-alert">{state.success}</div>}

      <form action={formAction} className="form-grid form-grid--simple">
        {(['starter', 'pro', 'business'] as const).map((tier) => {
          const p = presets[tier];
          return (
            <div key={tier} className="form-section plan-edit-card">
              <h3>{p.label}</h3>
              <div className="form-row">
                <div className="auth-field">
                  <label htmlFor={`${tier}_label`}>Nomi</label>
                  <input id={`${tier}_label`} name={`${tier}_label`} type="text" defaultValue={p.label} disabled={isPending} />
                </div>
                <div className="auth-field">
                  <label htmlFor={`${tier}_description`}>Tavsif</label>
                  <input id={`${tier}_description`} name={`${tier}_description`} type="text" defaultValue={p.description} disabled={isPending} />
                </div>
              </div>
              <div className="form-row form-row-3">
                <div className="auth-field">
                  <label htmlFor={`${tier}_maxFilial`}>Filial soni</label>
                  <input id={`${tier}_maxFilial`} name={`${tier}_maxFilial`} type="number" min={1} defaultValue={p.maxFilial} disabled={isPending} />
                </div>
                <div className="auth-field">
                  <label htmlFor={`${tier}_maxUsers`}>Xodim soni</label>
                  <input id={`${tier}_maxUsers`} name={`${tier}_maxUsers`} type="number" min={1} defaultValue={p.maxUsers} disabled={isPending} />
                </div>
                <div className="auth-field">
                  <label htmlFor={`${tier}_monthlyPrice`}>Oylik to&apos;lov</label>
                  <PriceInput id={`${tier}_monthlyPrice`} name={`${tier}_monthlyPrice`} defaultValue={p.monthlyPrice} disabled={isPending} />
                  <span className="field-hint">{fmtPlanPrice(p.monthlyPrice)} so&apos;m/oy</span>
                </div>
              </div>
            </div>
          );
        })}

        <div className="auth-alert auth-alert--info">
          <strong>Kelishuv tarifi</strong> — har bir biznes sahifasida alohida sozlanadi (filial, xodim, to&apos;lov, kelishuv matni).
        </div>

        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? 'Saqlanmoqda...' : 'Tariflarni saqlash'}
        </button>
      </form>
    </div>
  );
}
