'use client';

import { useActionState } from 'react';
import { applyBusinessPresetAction, updateOrgFeaturesAction } from '@/app/actions/orgFeatures';
import { getFeatureCategories, type FeatureExplain, type FeatureSource } from '@/lib/features';
import { BUSINESS_TYPE_IDS } from '@/lib/businessTypes';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { Alert, Pill, type PillTone } from './ui';

interface Props {
  orgId: string;
  /** Har modul: yakuniy qiymat + manba (tarif / preset / qo'lda) */
  explain: FeatureExplain;
  businessType?: string;
  /** Tarif kaliti — nomi lug'atdan (d.catalog.planTiers) */
  planTier: string;
}

const SOURCE_TONE: Record<FeatureSource, PillTone> = {
  plan: 'mut',
  preset: 'br',
  override: 'gold',
};

export default function OrgModulesForm({ orgId, explain, businessType = 'general', planTier }: Props) {
  const [state, formAction, isPending] = useActionState(updateOrgFeaturesAction, null);
  const [presetState, presetAction, presetPending] = useActionState(applyBusinessPresetAction, null);
  const d = useDict();
  const s = d.superPanel.orgModules;
  const planLabel = d.catalog.planTiers[planTier as keyof typeof d.catalog.planTiers] ?? planTier;
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
            <label htmlFor="presetBusinessType">{s.businessType}</label>
            <select id="presetBusinessType" name="businessType" defaultValue={businessType} disabled={busy} key={businessType}>
              {BUSINESS_TYPE_IDS.map((key) => (
                <option key={key} value={key}>{d.catalog.businessTypes[key].label}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="sa-btn sa-btn--tinted"
            disabled={busy}
            onClick={(e) => {
              if (overrideCount > 0 && !confirm(tr(s.presetConfirm, { n: overrideCount }))) e.preventDefault();
            }}
          >
            {presetPending ? s.applying : s.applyPreset}
          </button>
        </div>
        <div className="sa-gfoot" style={{ padding: 0 }}>{s.presetFoot}</div>
      </form>

      <div className="sa-legend" aria-label={s.legendAria}>
        <span><Pill tone={SOURCE_TONE.plan}>{s.source.plan}</Pill> {tr(s.legendPlan, { plan: planLabel })}</span>
        <span><Pill tone={SOURCE_TONE.preset}>{s.source.preset}</Pill> {s.legendPreset}</span>
        <span><Pill tone={SOURCE_TONE.override}>{s.source.override}</Pill> {tr(s.legendOverride, { n: overrideCount })}</span>
      </div>

      <form action={formAction} className="sa-form">
        <input type="hidden" name="orgId" value={orgId} />

        {categories.map((cat) => (
          <div key={cat.id} className="sa-section">
            <div className="sa-ghead">{d.catalog.featureCategories[cat.id]}</div>
            <div className="sa-group" style={{ background: 'var(--bg-soft)' }}>
              {cat.keys.map((key) => {
                const mod = d.catalog.features[key];
                const ex = explain[key];
                const inputId = `feature-${orgId}-${key}`;
                return (
                  <label key={`${key}-${ex.enabled}-${ex.source}`} className="sa-cell" htmlFor={inputId}>
                    <span className="sa-cell-t">
                      <b>{mod.label}</b>
                      <small className="sa-wrap">{mod.description}</small>
                    </span>
                    <span title={ex.source === 'override' ? tr(s.defaultTitle, { v: ex.base ? s.on : s.off }) : undefined}>
                      <Pill tone={SOURCE_TONE[ex.source]}>{s.source[ex.source]}</Pill>
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
            {isPending ? d.common.saving : s.saveModules}
          </button>
        </div>
      </form>
    </>
  );
}
