'use client';

import { useActionState, useState } from 'react';
import { updateOrganizationAction } from '@/app/actions/orgSettings';
import { PLAN_PRESETS } from '@/lib/plans';
import { BUSINESS_TYPES } from '@/lib/businessTypes';
import { formatPasswordHash } from '@/lib/credentials';
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
    passwordHash: string;
  };
}

export default function OrgEditForm({ orgId, initial }: Props) {
  const [state, formAction, isPending] = useActionState(updateOrganizationAction, null);
  const [planTier, setPlanTier] = useState(initial.planTier);

  return (
    <form action={formAction} className="sa-form">
      <input type="hidden" name="orgId" value={orgId} />

      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.success && <Alert tone="ok">{state.success}</Alert>}

      {/* Faqat ko'rish uchun ma'lumotlar — Settings uslubidagi guruh */}
      <div className="sa-section">
        <div className="sa-ghead">Kirish ma&apos;lumotlari</div>
        <div className="sa-group" style={{ background: 'var(--bg-soft)' }}>
          <div className="sa-cell sa-cell--ic">
            <Sq icon="globe" tone="b" />
            <span className="sa-cell-t"><b>Kirish manzili</b></span>
            <code className="sa-code">/t/{initial.slug}/login</code>
          </div>
          <div className="sa-cell sa-cell--ic">
            <Sq icon="building" tone="o" />
            <span className="sa-cell-t"><b>Baza</b></span>
            <code className="sa-code">{initial.dbName}</code>
          </div>
          <div className="sa-cell sa-cell--ic">
            <Sq icon="user" tone="v" />
            <span className="sa-cell-t"><b>Login</b></span>
            <code className="sa-code">{initial.adminUsername || '—'}</code>
          </div>
          <div className="sa-cell sa-cell--ic">
            <Sq icon="shield" tone="g" />
            <span className="sa-cell-t"><b>Parol (shifrlangan)</b></span>
            <code className="sa-code" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={formatPasswordHash(initial.passwordHash)}>
              {formatPasswordHash(initial.passwordHash)}
            </code>
          </div>
        </div>
        <div className="sa-gfoot">Faqat ko&apos;rish — parol bazada bcrypt bilan shifrlangan. Egasi profildan o&apos;zgartiradi.</div>
      </div>

      <div className="sa-fields">
        <div className="sa-field">
          <label htmlFor="name">Do&apos;kon nomi *</label>
          <input id="name" name="name" type="text" required defaultValue={initial.name} disabled={isPending} />
        </div>
        <div className="sa-field">
          <label htmlFor="businessType">Biznes turi</label>
          <select id="businessType" name="businessType" defaultValue={initial.businessType} disabled={isPending}>
            {Object.entries(BUSINESS_TYPES).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>
        </div>
        <div className="sa-grid-2">
          <div className="sa-field">
            <label htmlFor="ownerName">Egasi</label>
            <input id="ownerName" name="ownerName" type="text" defaultValue={initial.ownerName} disabled={isPending} />
          </div>
          <div className="sa-field">
            <label htmlFor="phone">Telefon</label>
            <input id="phone" name="phone" type="tel" defaultValue={initial.phone} disabled={isPending} />
          </div>
        </div>
      </div>

      <div className="sa-section">
        <div className="sa-ghead">Tarif va to&apos;lov</div>
        <div className="sa-fields">
          <div className="sa-field">
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
          <div className="sa-grid-3">
            <div className="sa-field">
              <label htmlFor="maxFilial">Filial soni</label>
              <input id="maxFilial" name="maxFilial" type="number" min={1} defaultValue={initial.maxFilial} disabled={isPending} />
            </div>
            <div className="sa-field">
              <label htmlFor="maxUsers">Xodim soni</label>
              <input id="maxUsers" name="maxUsers" type="number" min={1} defaultValue={initial.maxUsers} disabled={isPending} />
            </div>
            <div className="sa-field">
              <label htmlFor="monthlyPayment">Oylik to&apos;lov (so&apos;m)</label>
              <PriceInput id="monthlyPayment" name="monthlyPayment" defaultValue={initial.monthlyPayment} disabled={isPending} />
            </div>
          </div>
          {planTier === 'custom' && (
            <div className="sa-field">
              <label htmlFor="agreementNote">Kelishuv matni *</label>
              <textarea
                id="agreementNote"
                name="agreementNote"
                rows={3}
                required
                defaultValue={initial.agreementNote}
                disabled={isPending}
                placeholder="Masalan: 3 filial, 10 xodim, oylik 250 000 so'm, monitoring yoqilgan..."
              />
            </div>
          )}
        </div>
        <div className="sa-gfoot">Filial, xodim, modul va oylik to&apos;lovni qo&apos;lda o&apos;zgartirish mumkin.</div>
      </div>

      <div className="sa-section">
        <div className="sa-ghead">Obuna</div>
        <div className="sa-grid-2">
          <div className="sa-field">
            <label htmlFor="status">Holat</label>
            <select id="status" name="status" defaultValue={initial.status} disabled={isPending}>
              <option value="active">Faol</option>
              <option value="suspended">To&apos;xtatilgan</option>
              <option value="expired">Muddati tugagan</option>
            </select>
          </div>
          <div className="sa-field">
            <label htmlFor="expiresAt">Obuna muddati *</label>
            <input id="expiresAt" name="expiresAt" type="date" required defaultValue={initial.expiresAt} disabled={isPending} />
          </div>
        </div>
      </div>

      <div className="sa-form-actions">
        <button type="submit" className="sa-btn sa-btn--filled" disabled={isPending}>
          {isPending ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
      </div>
    </form>
  );
}
