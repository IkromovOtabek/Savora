'use client';

import { useActionState } from 'react';
import { applyBusinessPresetAction, updateOrgFeaturesAction } from '@/app/actions/orgFeatures';
import { getFeatureCategories, TENANT_MODULES, type FeatureExplain, type FeatureSource } from '@/lib/features';
import { BUSINESS_TYPES } from '@/lib/businessTypes';

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

export default function OrgModulesForm({ orgId, explain, businessType = 'general', planLabel }: Props) {
  const [state, formAction, isPending] = useActionState(updateOrgFeaturesAction, null);
  const [presetState, presetAction, presetPending] = useActionState(applyBusinessPresetAction, null);
  const categories = getFeatureCategories();
  const busy = isPending || presetPending;
  const overrideCount = Object.values(explain).filter((e) => e.source === 'override').length;
  const msg = presetState ?? state;

  return (
    <>
      {msg?.error && <div className="auth-alert auth-alert--error" style={{ margin: '16px 24px 0' }}>{msg.error}</div>}
      {msg?.success && <div className="auth-alert auth-alert--info" style={{ margin: '16px 24px 0' }}>{msg.success}</div>}

      {/* Biznes turi → preset. Override'lar tozalanadi, modullar tarif + preset bo'yicha */}
      <form action={presetAction} className="preset-bar">
        <input type="hidden" name="orgId" value={orgId} />
        <div className="auth-field">
          <label htmlFor="presetBusinessType">Biznes turi</label>
          <select id="presetBusinessType" name="businessType" defaultValue={businessType} disabled={busy} key={businessType}>
            {Object.entries(BUSINESS_TYPES).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="btn btn-ghost"
          disabled={busy}
          onClick={(e) => {
            if (overrideCount > 0 && !confirm(`${overrideCount} ta qo'lda o'zgartirilgan modul tozalanadi. Davom etasizmi?`)) e.preventDefault();
          }}
        >
          {presetPending ? 'Qo\'llanmoqda...' : 'Biznes turiga mos funksiyalarni qo\'llash'}
        </button>
      </form>

      <div className="feat-legend">
        <span><span className="feat-src feat-src--plan">Tarif</span> {planLabel} standarti</span>
        <span><span className="feat-src feat-src--preset">Preset</span> biznes turi bo&apos;yicha</span>
        <span><span className="feat-src feat-src--override">Qo&apos;lda</span> Super Admin o&apos;zgartirgan ({overrideCount})</span>
      </div>

      <form action={formAction} className="form-grid" style={{ padding: '20px 24px' }}>
        <input type="hidden" name="orgId" value={orgId} />

        {categories.map((cat) => (
          <div key={cat.id} className="module-group">
            <h3 className="module-group-title">{cat.label}</h3>
            <div className="module-grid">
              {cat.keys.map((key) => {
                const mod = TENANT_MODULES[key];
                const ex = explain[key];
                return (
                  <label key={`${key}-${ex.enabled}-${ex.source}`} className="module-check">
                    <input
                      type="checkbox"
                      name={`feature_${key}`}
                      defaultChecked={ex.enabled}
                      disabled={busy}
                    />
                    <span>
                      <strong>
                        {mod.label}
                        <span className={`feat-src feat-src--${ex.source}`} title={ex.source === 'override' ? `Standart: ${ex.base ? 'yoqiq' : 'o\'chiq'}` : undefined}>
                          {SOURCE_LABEL[ex.source]}
                        </span>
                      </strong>
                      <small>{mod.description}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {isPending ? 'Saqlanmoqda...' : 'Modullarni saqlash'}
        </button>
      </form>
    </>
  );
}
