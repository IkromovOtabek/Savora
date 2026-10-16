'use client';

import { useActionState, useState } from 'react';
import { updateOrganizationAction } from '@/app/actions/orgSettings';
import { PLAN_PRESETS } from '@/lib/plans';
import { BUSINESS_TYPE_IDS } from '@/lib/businessTypes';
import { useDict } from '@/lib/i18n/client';
import PriceInput from '@/components/ui/PriceInput';
import { Alert, Sq } from './ui';

interface Props {
  orgId: string;
  initial: {
    name: string;
    ownerName: string;
    phone: string;
    status: string;
    planTier: string;
    businessType: string;
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
}

export default function OrgEditForm({ orgId, initial }: Props) {
  const [state, formAction, isPending] = useActionState(updateOrganizationAction, null);
  const [planTier, setPlanTier] = useState(initial.planTier);
  const d = useDict();
  const s = d.superPanel.orgEdit;

  return (
    <form action={formAction} className="sa-form">
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
          <select id="businessType" name="businessType" defaultValue={initial.businessType} disabled={isPending}>
            {BUSINESS_TYPE_IDS.map((key) => (
              <option key={key} value={key}>{d.catalog.businessTypes[key].label}</option>
            ))}
          </select>
        </div>
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
              onChange={(e) => setPlanTier(e.target.value)}
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
              <input id="maxFilial" name="maxFilial" type="number" min={1} defaultValue={initial.maxFilial} disabled={isPending} />
            </div>
            <div className="sa-field">
              <label htmlFor="maxUsers">{s.userCount}</label>
              <input id="maxUsers" name="maxUsers" type="number" min={1} defaultValue={initial.maxUsers} disabled={isPending} />
            </div>
            <div className="sa-field">
              <label htmlFor="monthlyPayment">{s.monthlySum}</label>
              <PriceInput id="monthlyPayment" name="monthlyPayment" defaultValue={initial.monthlyPayment} disabled={isPending} />
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
