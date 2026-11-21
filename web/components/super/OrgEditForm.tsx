'use client';

import { startTransition, useActionState, useState, type FormEvent } from 'react';
import { updateOrganizationAction } from '@/app/actions/orgSettings';
import { PLAN_PRESETS } from '@/lib/plans';
import { BUSINESS_TYPE_IDS, INDUSTRY_PROFILES } from '@/lib/businessTypes';
import { useDict } from '@/lib/i18n/client';
import PriceInput from '@/components/ui/PriceInput';
import { Alert, Sq } from './ui';
import OrgAdminPasswordReset from './OrgAdminPasswordReset';

interface Props {
  orgId: string;
  initial: {
    name: string;
    ownerName: string;
    phone: string;
    status: string;
    planTier: string;
    businessType: string;
    /** Ishlab chiqarish sexi kichik yo'nalishi ('' — tanlanmagan) */
    industryProfile?: string;
    expiresAt: string;
    slug: string;
    dbName: string;
    maxFilial: number;
    maxUsers: number;
    monthlyPayment: number;
    agreementNote: string;
    adminUsername: string;
    /** 'set' — parol o'rnatilgan; xeshning o'zi client'ga uzatilmaydi */
    passwordHash: string;
  };
  /** Tarif standarti (filial, xodim, oylik narx) — tarif tanlanganda maydonlar shundan to'ldiriladi */
  planDefaults: Partial<Record<string, PlanLimits>>;
}

type PlanLimits = { maxFilial: number; maxUsers: number; monthlyPayment: number };

/** Input'lar uchun satr ko'rinishi (maydonni bo'shatib qayta yozish mumkin bo'lsin) */
function limitsState(l: PlanLimits) {
  return { maxFilial: String(l.maxFilial), maxUsers: String(l.maxUsers), monthlyPayment: String(l.monthlyPayment) };
}

export default function OrgEditForm({ orgId, initial, planDefaults }: Props) {
  const [state, formAction, isPending] = useActionState(updateOrganizationAction, null);
  const [planTier, setPlanTier] = useState(initial.planTier);
  const [limits, setLimits] = useState(() => limitsState(initial));
  const [bizType, setBizType] = useState(initial.businessType);
  const d = useDict();
  const s = d.superPanel.orgEdit;

  const setLimit = (key: keyof PlanLimits, value: string) => setLimits((l) => ({ ...l, [key]: value }));

  function changeTier(tier: string) {
    setPlanTier(tier);
    // Tarif almashsa — filial/xodim/narx yangi tarif standartiga o'tadi (keyin qo'lda o'zgartirsa bo'ladi).
    // Aks holda eski tarif limitlari yuborilib, tarif nomi o'zgarsa ham limit va narx eskicha qolardi.
    // O'z tarifiga qaytsa — saqlangan qiymatlar; «Kelishuv»da joriy qiymatlar qoladi.
    const preset = planDefaults[tier];
    if (tier === initial.planTier) setLimits(limitsState(initial));
    else if (tier !== 'custom' && preset) setLimits(limitsState(preset));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    // `<form action>` React 19 da action'dan keyin formani reset qiladi: tarif <select>'i eski tarifga
    // qaytib ko'rinardi, keyingi saqlashda esa eski tarif qayta yozilardi. Shuning uchun reset'siz yuboramiz.
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  }

  return (
    <form onSubmit={handleSubmit} className="sa-form">
      <input type="hidden" name="orgId" value={orgId} />

      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.success && <Alert tone="ok">{state.success}</Alert>}

      {/* Faqat ko'rish uchun ma'lumotlar — Settings uslubidagi guruh */}
      <div className="sa-section">
        <div className="sa-ghead">{s.loginInfo}</div>
        <div className="sa-group" style={{ background: 'var(--bg-soft)' }}>
          <div className="sa-cell sa-cell--ic">
            <Sq icon="globe" tone="b" />
            <span className="sa-cell-t"><b>{s.loginUrl}</b></span>
            <code className="sa-code">/t/{initial.slug}/login</code>
          </div>
          <div className="sa-cell sa-cell--ic">
            <Sq icon="building" tone="o" />
            <span className="sa-cell-t"><b>{s.database}</b></span>
            <code className="sa-code">{initial.dbName}</code>
          </div>
          <div className="sa-cell sa-cell--ic">
            <Sq icon="user" tone="v" />
            <span className="sa-cell-t"><b>{s.login}</b></span>
            <code className="sa-code">{initial.adminUsername || '—'}</code>
          </div>
          <div className="sa-cell sa-cell--ic">
            <Sq icon="shield" tone="g" />
            <span className="sa-cell-t"><b>{s.passwordHashed}</b></span>
            <code className="sa-code">{initial.passwordHash ? '••••••••' : s.notSet}</code>
          </div>
          {initial.passwordHash && <OrgAdminPasswordReset orgId={orgId} username={initial.adminUsername} />}
        </div>
        <div className="sa-gfoot">{s.loginFoot}</div>
      </div>

      <div className="sa-fields">
        <div className="sa-field">
          <label htmlFor="name">{s.storeName}</label>
          <input id="name" name="name" type="text" required defaultValue={initial.name} disabled={isPending} />
        </div>
        <div className="sa-field">
          <label htmlFor="businessType">{s.businessType}</label>
          <select id="businessType" name="businessType" defaultValue={initial.businessType} disabled={isPending} onChange={(e) => setBizType(e.target.value)}>
            {BUSINESS_TYPE_IDS.map((key) => (
              <option key={key} value={key}>{d.catalog.businessTypes[key].label}</option>
            ))}
          </select>
        </div>
        {bizType === 'manufacturing' && (
          <div className="sa-field">
            <label htmlFor="industryProfile">{d.catalog.industryProfileLabel}</label>
            <select id="industryProfile" name="industryProfile" defaultValue={initial.industryProfile ?? ''} disabled={isPending}>
              <option value="">{d.catalog.industryProfileNone}</option>
              {INDUSTRY_PROFILES.map((key) => (
                <option key={key} value={key}>{d.catalog.industryProfiles[key].label}</option>
              ))}
            </select>
          </div>
        )}
        <div className="sa-grid-2">
          <div className="sa-field">
            <label htmlFor="ownerName">{s.owner}</label>
            <input id="ownerName" name="ownerName" type="text" defaultValue={initial.ownerName} disabled={isPending} />
          </div>
          <div className="sa-field">
            <label htmlFor="phone">{d.common.phone}</label>
            <input id="phone" name="phone" type="tel" defaultValue={initial.phone} disabled={isPending} />
          </div>
        </div>
      </div>

      <div className="sa-section">
        <div className="sa-ghead">{s.planAndPayment}</div>
        <div className="sa-fields">
          <div className="sa-field">
            <label htmlFor="planTier">{s.plan}</label>
            <select
              id="planTier"
              name="planTier"
              value={planTier}
              onChange={(e) => changeTier(e.target.value)}
              disabled={isPending}
            >
              {Object.values(PLAN_PRESETS).map((p) => (
                <option key={p.tier} value={p.tier}>{d.catalog.planTiers[p.tier]} — {d.superPanel.planDesc[p.tier]}</option>
              ))}
            </select>
          </div>
          <div className="sa-grid-3">
            <div className="sa-field">
              <label htmlFor="maxFilial">{s.branchCount}</label>
              <input id="maxFilial" name="maxFilial" type="number" min={1} value={limits.maxFilial} onChange={(e) => setLimit('maxFilial', e.target.value)} disabled={isPending} />
            </div>
            <div className="sa-field">
              <label htmlFor="maxUsers">{s.userCount}</label>
              <input id="maxUsers" name="maxUsers" type="number" min={1} value={limits.maxUsers} onChange={(e) => setLimit('maxUsers', e.target.value)} disabled={isPending} />
            </div>
            <div className="sa-field">
              <label htmlFor="monthlyPayment">{s.monthlySum}</label>
              <PriceInput id="monthlyPayment" name="monthlyPayment" value={limits.monthlyPayment} onValueChange={(v) => setLimit('monthlyPayment', v)} disabled={isPending} />
            </div>
          </div>
          {planTier === 'custom' && (
            <div className="sa-field">
              <label htmlFor="agreementNote">{s.agreementNote}</label>
              <textarea
                id="agreementNote"
                name="agreementNote"
                rows={3}
                required
                defaultValue={initial.agreementNote}
                disabled={isPending}
                placeholder={s.agreementPlaceholder}
              />
            </div>
          )}
        </div>
        <div className="sa-gfoot">{s.planFoot}</div>
      </div>

      <div className="sa-section">
        <div className="sa-ghead">{s.subscription}</div>
        <div className="sa-grid-2">
          <div className="sa-field">
            <label htmlFor="status">{s.status}</label>
            <select id="status" name="status" defaultValue={initial.status} disabled={isPending}>
              <option value="active">{d.superPanel.status.active}</option>
              <option value="suspended">{d.superPanel.status.suspended}</option>
              <option value="expired">{d.superPanel.status.expired}</option>
            </select>
          </div>
          <div className="sa-field">
            <label htmlFor="expiresAt">{s.expiresAt}</label>
            <input id="expiresAt" name="expiresAt" type="date" required defaultValue={initial.expiresAt} disabled={isPending} />
          </div>
        </div>
      </div>

      <div className="sa-form-actions">
        <button type="submit" className="sa-btn sa-btn--filled" disabled={isPending}>
          {isPending ? d.common.saving : d.common.save}
        </button>
      </div>
    </form>
  );
}
