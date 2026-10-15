'use client';

import { useActionState } from 'react';
import { applyBusinessPresetAction, updateOrgFeaturesAction } from '@/app/actions/orgFeatures';
import { getFeatureCategories, TENANT_MODULES, type FeatureExplain, type FeatureSource } from '@/lib/features';
import { BUSINESS_TYPES } from '@/lib/businessTypes';
import { Alert, Pill, type PillTone } from './ui';

interface Props {
  orgId: string;
  /** Har modul: yakuniy qiymat + manba (tarif / preset / qo'lda) */
  explain: FeatureExplain;
  businessType?: string;
  planLabel: string;
}

const SOURCE_LABEL: Record<FeatureSource, string> = {
  plan: 'Tarif',
  preset: 'Preset',
  override: "Qo'lda",
};

const SOURCE_TONE: Record<FeatureSource, PillTone> = {
  plan: 'mut',
  preset: 'br',
  override: 'gold',
};

export default function OrgModulesForm({ orgId, explain, businessType = 'general', planLabel }: Props) {
  const [state, formAction, isPending] = useActionState(updateOrgFeaturesAction, null);
  const [presetState, presetAction, presetPending] = useActionState(applyBusinessPresetAction, null);
  const categories = getFeatureCategories();
  const busy = isPending || presetPending;
  const overrideCount = Object.values(explain).filter((e) => e.source === 'override').length;
  const msg = presetState ?? state;

  return (
    <>
      {msg?.error && <Alert tone="error">{msg.error}</Alert>}
      {msg?.success && <Alert tone="ok">{msg.success}</Alert>}

      {/* Biznes turi → preset. Override'lar tozalanadi, modullar tarif + preset bo'yicha */}
      <form action={presetAction} className="sa-section">
        <input type="hidden" name="orgId" value={orgId} />
        <div className="sa-preset">
          <div className="sa-field">
            <label htmlFor="presetBusinessType">Biznes turi</label>
            <select id="presetBusinessType" name="businessType" defaultValue={businessType} disabled={busy} key={businessType}>
              {Object.entries(BUSINESS_TYPES).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="sa-btn sa-btn--tinted"
            disabled={busy}
            onClick={(e) => {
              if (overrideCount > 0 && !confirm(`${overrideCount} ta qo'lda o'zgartirilgan modul tozalanadi. Davom etasizmi?`)) e.preventDefault();
            }}
          >
            {presetPending ? 'Qo\'llanmoqda…' : 'Biznes turiga moslab qo\'llash'}
          </button>
        </div>
        <div className="sa-gfoot" style={{ padding: 0 }}>Qo&apos;lda qilingan o&apos;zgarishlar tozalanadi, modullar tarif va biznes turi bo&apos;yicha qayta yoqiladi.</div>
      </form>

      <div className="sa-legend" aria-label="Manba belgilari">
        <span><Pill tone={SOURCE_TONE.plan}>Tarif</Pill> {planLabel} standarti</span>
        <span><Pill tone={SOURCE_TONE.preset}>Preset</Pill> biznes turi bo&apos;yicha</span>
        <span><Pill tone={SOURCE_TONE.override}>Qo&apos;lda</Pill> Super Admin o&apos;zgartirgan ({overrideCount})</span>
      </div>

      <form action={formAction} className="sa-form">
        <input type="hidden" name="orgId" value={orgId} />

        {categories.map((cat) => (
          <div key={cat.id} className="sa-section">
            <div className="sa-ghead">{cat.label}</div>
            <div className="sa-group" style={{ background: 'var(--bg-soft)' }}>
              {cat.keys.map((key) => {
                const mod = TENANT_MODULES[key];
                const ex = explain[key];
                const inputId = `feature-${orgId}-${key}`;
                return (
                  <label key={`${key}-${ex.enabled}-${ex.source}`} className="sa-cell" htmlFor={inputId}>
                    <span className="sa-cell-t">
                      <b>{mod.label}</b>
                      <small className="sa-wrap">{mod.description}</small>
                    </span>
                    <span title={ex.source === 'override' ? `Standart: ${ex.base ? 'yoqiq' : 'o\'chiq'}` : undefined}>
                      <Pill tone={SOURCE_TONE[ex.source]}>{SOURCE_LABEL[ex.source]}</Pill>
                    </span>
                    <input
                      id={inputId}
                      type="checkbox"
                      role="switch"
                      className="sa-switch"
                      name={`feature_${key}`}
                      defaultChecked={ex.enabled}
                      disabled={busy}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ))}

        <div className="sa-form-actions">
          <button type="submit" className="sa-btn sa-btn--filled" disabled={busy}>
            {isPending ? 'Saqlanmoqda…' : 'Modullarni saqlash'}
          </button>
        </div>
      </form>
    </>
  );
}
