'use client';

import { useActionState, useState } from 'react';
import { createOrganizationAction } from '@/app/actions/organizations';
import { normalizeSlug } from '@/lib/slug';
import { PLAN_PRESETS } from '@/lib/plans';
import { BUSINESS_TYPES } from '@/lib/businessTypes';
import PriceInput from '@/components/ui/PriceInput';
import { Alert, PageTitle } from '@/components/super/ui';

export default function CreateOrgForm() {
  const [state, formAction, isPending] = useActionState(createOrganizationAction, null);
  const [planTier, setPlanTier] = useState('pro');

  return (
    <div className="sa-stack" style={{ maxWidth: 720 }}>
      <PageTitle title="Yangi do'kon" sub="Do'kon, admin login va tarifni sozlang" back={{ href: '/super', label: "Do'konlar" }} />

      {state?.error && <Alert tone="error">{state.error}</Alert>}

      <form action={formAction} className="sa-form">
        <section className="sa-section">
          <div className="sa-ghead">1. Do&apos;kon</div>
          <div className="sa-card sa-fields" style={{ padding: 16 }}>
            <div className="sa-field">
              <label htmlFor="name">Nomi *</label>
              <input id="name" name="name" type="text" required disabled={isPending} placeholder="Masalan: Oltin Do'kon" />
            </div>
            <div className="sa-grid-2">
              <div className="sa-field">
                <label htmlFor="businessType">Turi *</label>
                <select id="businessType" name="businessType" defaultValue="general" disabled={isPending}>
                  {Object.entries(BUSINESS_TYPES).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
              </div>
              <div className="sa-field">
                <label htmlFor="slug">Manzil (slug) *</label>
                <input id="slug" name="slug" type="text" required disabled={isPending} placeholder="dokon1" autoCapitalize="none" spellCheck={false} onBlur={(e) => { e.target.value = normalizeSlug(e.target.value); }} />
                <span className="sa-hint">Kirish: /t/slug/login</span>
              </div>
            </div>
            <div className="sa-grid-2">
              <div className="sa-field">
                <label htmlFor="ownerName">Egasi</label>
                <input id="ownerName" name="ownerName" type="text" disabled={isPending} />
              </div>
              <div className="sa-field">
                <label htmlFor="phone">Telefon</label>
                <input id="phone" name="phone" type="tel" disabled={isPending} placeholder="+998..." />
              </div>
            </div>
          </div>
        </section>

        <section className="sa-section">
          <div className="sa-ghead">2. Admin kirishi</div>
          <div className="sa-card sa-fields" style={{ padding: 16 }}>
            <div className="sa-field">
              <label htmlFor="adminUsername">Login *</label>
              <input
                id="adminUsername"
                name="adminUsername"
                type="text"
                required
                disabled={isPending}
                placeholder="masalan: dokon1admin"
                autoCapitalize="none"
                spellCheck={false}
                onBlur={(e) => { e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''); }}
              />
              <span className="sa-hint">Lotin harf, raqam, _ (kamida 3 belgi). Egasi birinchi kirishda parolni o&apos;zi belgilaydi.</span>
            </div>
          </div>
        </section>

        <section className="sa-section">
          <div className="sa-ghead">3. Tarif</div>
          <div className="sa-card sa-fields" style={{ padding: 16 }}>
            <div className="sa-field">
              <label htmlFor="planTier">Tarif</label>
              <select id="planTier" name="planTier" value={planTier} onChange={(e) => setPlanTier(e.target.value)} disabled={isPending}>
                {Object.values(PLAN_PRESETS).map((p) => (
                  <option key={p.tier} value={p.tier}>{p.label} — {p.maxFilial} filial, {p.maxUsers} xodim</option>
                ))}
              </select>
            </div>
            <div className="sa-grid-3">
              <div className="sa-field">
                <label htmlFor="maxFilial">Filial</label>
                <input id="maxFilial" name="maxFilial" type="number" min={1} defaultValue={PLAN_PRESETS.pro.maxFilial} disabled={isPending} />
              </div>
              <div className="sa-field">
                <label htmlFor="maxUsers">Xodim</label>
                <input id="maxUsers" name="maxUsers" type="number" min={1} defaultValue={PLAN_PRESETS.pro.maxUsers} disabled={isPending} />
              </div>
              <div className="sa-field">
                <label htmlFor="monthlyPayment">Oylik (so&apos;m)</label>
                <PriceInput id="monthlyPayment" name="monthlyPayment" defaultValue={PLAN_PRESETS.pro.monthlyPrice} disabled={isPending} />
              </div>
            </div>
            {planTier === 'custom' && (
              <div className="sa-field">
                <label htmlFor="agreementNote">Kelishuv matni *</label>
                <textarea id="agreementNote" name="agreementNote" rows={3} required disabled={isPending} />
              </div>
            )}
            <div className="sa-field" style={{ maxWidth: 240 }}>
              <label htmlFor="trialDays">Sinov muddati (kun)</label>
              <input id="trialDays" name="trialDays" type="number" min={1} max={3650} defaultValue={30} disabled={isPending} />
            </div>
          </div>
        </section>

        <button type="submit" className="sa-btn sa-btn--filled sa-btn--lg sa-btn--block" disabled={isPending}>
          {isPending ? 'Yaratilmoqda…' : "Do'kon yaratish"}
        </button>
      </form>
    </div>
  );
}
