'use client';

import { useActionState, useState } from 'react';
import { updateOrganizationAction } from '@/app/actions/orgSettings';
import { PLAN_PRESETS } from '@/lib/plans';
import { BUSINESS_TYPES } from '@/lib/businessTypes';
import { formatPasswordHash } from '@/lib/credentials';
import { IconBadge } from '@/components/icons/Icon';

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
    passwordHash: string;
  };
}

export default function OrgEditForm({ orgId, initial }: Props) {
  const [state, formAction, isPending] = useActionState(updateOrganizationAction, null);
  const [planTier, setPlanTier] = useState(initial.planTier);

  return (
    <>
      {state?.error && <div className="auth-alert auth-alert--error panel-alert">{state.error}</div>}
      {state?.success && <div className="auth-alert auth-alert--info panel-alert">{state.success}</div>}

      <form action={formAction} className="form-grid form-grid--simple">
        <input type="hidden" name="orgId" value={orgId} />

        <div className="org-meta-grid">
          <div className="org-meta-item">
            <IconBadge name="globe" bg="linear-gradient(135deg,#0ea5e9,#6366f1)" className="icon-badge--sm" />
            <div>
              <span className="org-meta-label">Kirish manzili</span>
              <code>/t/{initial.slug}/login</code>
            </div>
          </div>
          <div className="org-meta-item">
            <IconBadge name="building" bg="linear-gradient(135deg,#10b981,#059669)" className="icon-badge--sm" />
            <div>
              <span className="org-meta-label">Baza</span>
              <code>{initial.dbName}</code>
            </div>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-head">
            <IconBadge name="login" bg="linear-gradient(135deg,#f59e0b,#ef4444)" className="icon-badge--sm" />
            <div>
              <h3>Kirish ma&apos;lumotlari</h3>
              <p className="field-hint">Faqat ko&apos;rish — parol bazada bcrypt bilan shifrlangan. Egasi profildan o&apos;zgartiradi.</p>
            </div>
          </div>

          <div className="org-cred-grid">
            <div className="org-cred-item org-cred-item--readonly">
              <IconBadge name="user" bg="linear-gradient(135deg,#6366f1,#8b5cf6)" className="icon-badge--sm" />
              <div className="org-cred-field">
                <span className="org-meta-label">Login</span>
                <code className="cred-value">{initial.adminUsername || '—'}</code>
              </div>
            </div>
            <div className="org-cred-item org-cred-item--readonly">
              <IconBadge name="shield" bg="linear-gradient(135deg,#10b981,#059669)" className="icon-badge--sm" />
              <div className="org-cred-field">
                <span className="org-meta-label">Parol (shifrlangan)</span>
                <code className="cred-value cred-hash">{formatPasswordHash(initial.passwordHash)}</code>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="name">Biznes nomi *</label>
          <input id="name" name="name" type="text" required defaultValue={initial.name} disabled={isPending} />
        </div>

        <div className="auth-field">
          <label htmlFor="businessType">Biznes turi</label>
          <select id="businessType" name="businessType" defaultValue={initial.businessType} disabled={isPending}>
            {Object.entries(BUSINESS_TYPES).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <div className="auth-field">
            <label htmlFor="ownerName">Egasi</label>
            <input id="ownerName" name="ownerName" type="text" defaultValue={initial.ownerName} disabled={isPending} />
          </div>
          <div className="auth-field">
            <label htmlFor="phone">Telefon</label>
            <input id="phone" name="phone" type="tel" defaultValue={initial.phone} disabled={isPending} />
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-head">
            <IconBadge name="plans" bg="linear-gradient(135deg,#7c3aed,#9333ea)" className="icon-badge--sm" />
            <div>
              <h3>Tarif va to&apos;lov</h3>
              <p className="field-hint">Filial, xodim, modul va oylik to&apos;lovni qo&apos;lda o&apos;zgartirish mumkin.</p>
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="planTier">Tarif</label>
            <select
              id="planTier"
              name="planTier"
              value={planTier}
              onChange={(e) => setPlanTier(e.target.value)}
              disabled={isPending}
            >
              {Object.values(PLAN_PRESETS).map((p) => (
                <option key={p.tier} value={p.tier}>{p.label} — {p.description}</option>
              ))}
            </select>
          </div>

          <div className="form-row form-row-3">
            <div className="auth-field">
              <label htmlFor="maxFilial">Filial soni</label>
              <input id="maxFilial" name="maxFilial" type="number" min={1} defaultValue={initial.maxFilial} disabled={isPending} />
            </div>
            <div className="auth-field">
              <label htmlFor="maxUsers">Xodim soni</label>
              <input id="maxUsers" name="maxUsers" type="number" min={1} defaultValue={initial.maxUsers} disabled={isPending} />
            </div>
            <div className="auth-field">
              <label htmlFor="monthlyPayment">Oylik to&apos;lov (so&apos;m)</label>
              <input id="monthlyPayment" name="monthlyPayment" type="number" min={0} defaultValue={initial.monthlyPayment} disabled={isPending} />
            </div>
          </div>

          {planTier === 'custom' && (
            <div className="auth-field">
              <label htmlFor="agreementNote">Kelishuv matni *</label>
              <textarea
                id="agreementNote"
                name="agreementNote"
                rows={3}
                required
                defaultValue={initial.agreementNote}
                disabled={isPending}
                className="text-area"
                placeholder="Masalan: 3 filial, 10 xodim, oylik 250 000 so'm, monitoring yoqilgan..."
              />
            </div>
          )}
        </div>

        <div className="form-row">
          <div className="auth-field">
            <label htmlFor="status">Holat</label>
            <select id="status" name="status" defaultValue={initial.status} disabled={isPending}>
              <option value="active">Faol</option>
              <option value="suspended">To&apos;xtatilgan</option>
              <option value="expired">Muddati tugagan</option>
            </select>
          </div>
          <div className="auth-field">
            <label htmlFor="expiresAt">Obuna muddati *</label>
            <input id="expiresAt" name="expiresAt" type="date" required defaultValue={initial.expiresAt} disabled={isPending} />
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={isPending}>Saqlash</button>
      </form>
    </>
  );
}
