'use client';

import { useActionState, useState } from 'react';
import { createOrganizationAction } from '@/app/actions/organizations';
import { normalizeSlug } from '@/lib/slug';
import { PLAN_PRESETS } from '@/lib/plans';
import { BUSINESS_TYPE_IDS } from '@/lib/businessTypes';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import PriceInput from '@/components/ui/PriceInput';
import { Alert, PageTitle } from '@/components/super/ui';

export default function CreateOrgForm() {
  const [state, formAction, isPending] = useActionState(createOrganizationAction, null);
  const [planTier, setPlanTier] = useState('pro');
  const d = useDict();
  const s = d.superPanel.newOrg;

  return (
    <div className="sa-stack" style={{ maxWidth: 720 }}>
      <PageTitle title={s.title} sub={s.sub} back={{ href: '/super', label: d.superPanel.orgs.title }} />

      {state?.error && <Alert tone="error">{state.error}</Alert>}

      <form action={formAction} className="sa-form">
        <section className="sa-section">
          <div className="sa-ghead">{s.step1}</div>
          <div className="sa-card sa-fields" style={{ padding: 16 }}>
            <div className="sa-field">
              <label htmlFor="name">{s.name}</label>
              <input id="name" name="name" type="text" required disabled={isPending} placeholder={s.namePlaceholder} />
            </div>
            <div className="sa-grid-2">
              <div className="sa-field">
                <label htmlFor="businessType">{s.type}</label>
                <select id="businessType" name="businessType" defaultValue="general" disabled={isPending}>
                  {BUSINESS_TYPE_IDS.map((key) => (
                    <option key={key} value={key}>{d.catalog.businessTypes[key].label}</option>
                  ))}
                </select>
              </div>
              <div className="sa-field">
                <label htmlFor="slug">{s.slug}</label>
                <input id="slug" name="slug" type="text" required disabled={isPending} placeholder="dokon1" autoCapitalize="none" spellCheck={false} onBlur={(e) => { e.target.value = normalizeSlug(e.target.value); }} />
                <span className="sa-hint">{s.slugHint}</span>
              </div>
            </div>
            <div className="sa-grid-2">
              <div className="sa-field">
                <label htmlFor="ownerName">{s.owner}</label>
                <input id="ownerName" name="ownerName" type="text" disabled={isPending} />
              </div>
              <div className="sa-field">
                <label htmlFor="phone">{d.common.phone}</label>
                <input id="phone" name="phone" type="tel" disabled={isPending} placeholder="+998..." />
              </div>
            </div>
          </div>
        </section>

        <section className="sa-section">
          <div className="sa-ghead">{s.step2}</div>
          <div className="sa-card sa-fields" style={{ padding: 16 }}>
            <div className="sa-field">
              <label htmlFor="adminUsername">{s.login}</label>
              <input
                id="adminUsername"
                name="adminUsername"
                type="text"
                required
                disabled={isPending}
                placeholder={s.loginPlaceholder}
                autoCapitalize="none"
                spellCheck={false}
                onBlur={(e) => { e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''); }}
              />
              <span className="sa-hint">{s.loginHint}</span>
            </div>
          </div>
        </section>

        <section className="sa-section">
          <div className="sa-ghead">{s.step3}</div>
          <div className="sa-card sa-fields" style={{ padding: 16 }}>
            <div className="sa-field">
              <label htmlFor="planTier">{s.plan}</label>
              <select id="planTier" name="planTier" value={planTier} onChange={(e) => setPlanTier(e.target.value)} disabled={isPending}>
                {Object.values(PLAN_PRESETS).map((p) => (
                  <option key={p.tier} value={p.tier}>
                    {tr(s.planOption, { label: d.catalog.planTiers[p.tier], filial: p.maxFilial, users: p.maxUsers })}
                  </option>
                ))}
              </select>
            </div>
            <div className="sa-grid-3">
              <div className="sa-field">
                <label htmlFor="maxFilial">{s.branch}</label>
                <input id="maxFilial" name="maxFilial" type="number" min={1} defaultValue={PLAN_PRESETS.pro.maxFilial} disabled={isPending} />
              </div>
              <div className="sa-field">
                <label htmlFor="maxUsers">{s.user}</label>
                <input id="maxUsers" name="maxUsers" type="number" min={1} defaultValue={PLAN_PRESETS.pro.maxUsers} disabled={isPending} />
              </div>
              <div className="sa-field">
                <label htmlFor="monthlyPayment">{s.monthlySum}</label>
                <PriceInput id="monthlyPayment" name="monthlyPayment" defaultValue={PLAN_PRESETS.pro.monthlyPrice} disabled={isPending} />
              </div>
            </div>
            {planTier === 'custom' && (
              <div className="sa-field">
                <label htmlFor="agreementNote">{s.agreementNote}</label>
                <textarea id="agreementNote" name="agreementNote" rows={3} required disabled={isPending} />
              </div>
            )}
            <div className="sa-field" style={{ maxWidth: 240 }}>
              <label htmlFor="trialDays">{s.trialDays}</label>
              <input id="trialDays" name="trialDays" type="number" min={1} max={3650} defaultValue={30} disabled={isPending} />
            </div>
          </div>
        </section>

        <button type="submit" className="sa-btn sa-btn--filled sa-btn--lg sa-btn--block" disabled={isPending}>
          {isPending ? s.creating : s.create}
        </button>
      </form>
    </div>
  );
}
