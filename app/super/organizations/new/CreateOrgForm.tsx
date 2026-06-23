'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { createOrganizationAction } from '@/app/actions/organizations';
import { normalizeSlug } from '@/lib/slug';
import { PLAN_PRESETS } from '@/lib/plans';
import { BUSINESS_TYPES } from '@/lib/businessTypes';
import Icon from '@/components/icons/Icon';
import PriceInput from '@/components/ui/PriceInput';

export default function CreateOrgForm() {
  const [state, formAction, isPending] = useActionState(createOrganizationAction, null);
  const [planTier, setPlanTier] = useState('pro');

  return (
    <div className="panel panel--narrow">
      <div className="panel-head">
        <h2>Yangi biznes</h2>
        <Link href="/super" className="btn btn-ghost btn-sm btn-with-icon">
          <Icon name="arrowLeft" size={16} />
          Orqaga
        </Link>
      </div>

      {state?.error && <div className="auth-alert auth-alert--error panel-alert">{state.error}</div>}

      <form action={formAction} className="form-grid form-grid--simple">
        <div className="form-section">
          <h3>1. Biznes</h3>
          <div className="auth-field">
            <label htmlFor="name">Nomi *</label>
            <input id="name" name="name" type="text" required disabled={isPending} placeholder="Masalan: Oltin Do'kon" />
          </div>
          <div className="auth-field">
            <label htmlFor="businessType">Turi *</label>
            <select id="businessType" name="businessType" defaultValue="general" disabled={isPending}>
              {Object.entries(BUSINESS_TYPES).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>
          <div className="auth-field">
            <label htmlFor="slug">Manzil (slug) *</label>
            <input id="slug" name="slug" type="text" required disabled={isPending} placeholder="dokon1" onBlur={(e) => { e.target.value = normalizeSlug(e.target.value); }} />
            <span className="field-hint">Kirish: /t/slug/login</span>
          </div>
          <div className="form-row">
            <div className="auth-field">
              <label htmlFor="ownerName">Egasi</label>
              <input id="ownerName" name="ownerName" type="text" disabled={isPending} />
            </div>
            <div className="auth-field">
              <label htmlFor="phone">Telefon</label>
              <input id="phone" name="phone" type="tel" disabled={isPending} />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>2. Admin kirish</h3>
          <div className="auth-field">
            <label htmlFor="adminUsername">Login *</label>
            <input
              id="adminUsername"
              name="adminUsername"
              type="text"
              required
              disabled={isPending}
              placeholder="masalan: dokon1admin"
              onBlur={(e) => { e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''); }}
            />
            <span className="field-hint">Lotin harf, raqam, _ (kamida 3 belgi). Egasi birinchi kirishda parolni o&apos;zi belgilaydi.</span>
          </div>
        </div>

        <div className="form-section">
          <h3>3. Tarif</h3>
          <div className="auth-field">
            <label htmlFor="planTier">Tarif</label>
            <select id="planTier" name="planTier" value={planTier} onChange={(e) => setPlanTier(e.target.value)} disabled={isPending}>
              {Object.values(PLAN_PRESETS).map((p) => (
                <option key={p.tier} value={p.tier}>{p.label} — {p.maxFilial} filial, {p.maxUsers} xodim</option>
              ))}
            </select>
          </div>
          <div className="form-row form-row-3">
            <div className="auth-field">
              <label htmlFor="maxFilial">Filial</label>
              <input id="maxFilial" name="maxFilial" type="number" min={1} defaultValue={PLAN_PRESETS.pro.maxFilial} disabled={isPending} />
            </div>
            <div className="auth-field">
              <label htmlFor="maxUsers">Xodim</label>
              <input id="maxUsers" name="maxUsers" type="number" min={1} defaultValue={PLAN_PRESETS.pro.maxUsers} disabled={isPending} />
            </div>
            <div className="auth-field">
              <label htmlFor="monthlyPayment">Oylik (so&apos;m)</label>
              <PriceInput id="monthlyPayment" name="monthlyPayment" defaultValue={PLAN_PRESETS.pro.monthlyPrice} disabled={isPending} />
            </div>
          </div>
          {planTier === 'custom' && (
            <div className="auth-field">
              <label htmlFor="agreementNote">Kelishuv matni *</label>
              <textarea id="agreementNote" name="agreementNote" rows={3} required disabled={isPending} className="text-area" />
            </div>
          )}
          <div className="auth-field">
            <label htmlFor="trialDays">Sinov muddati (kun)</label>
            <input id="trialDays" name="trialDays" type="number" min={1} max={3650} defaultValue={30} disabled={isPending} />
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-lg" disabled={isPending}>
          {isPending ? 'Yaratilmoqda...' : 'Biznes yaratish'}
        </button>
      </form>
    </div>
  );
}
