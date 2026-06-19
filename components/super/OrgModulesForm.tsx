'use client';

import { useActionState } from 'react';
import { updateOrgFeaturesAction } from '@/app/actions/orgFeatures';
import { getFeatureCategories, OrgFeatures, TENANT_MODULES } from '@/lib/features';

interface Props {
  orgId: string;
  initial: OrgFeatures;
  businessType?: string;
}

export default function OrgModulesForm({ orgId, initial, businessType = 'general' }: Props) {
  const [state, formAction, isPending] = useActionState(updateOrgFeaturesAction, null);
  const categories = getFeatureCategories();

  return (
    <>
      {state?.error && <div className="auth-alert auth-alert--error" style={{ margin: '16px 24px 0' }}>{state.error}</div>}
      {state?.success && <div className="auth-alert auth-alert--info" style={{ margin: '16px 24px 0' }}>{state.success}</div>}

      <form action={formAction} className="form-grid" style={{ padding: '20px 24px' }}>
        <input type="hidden" name="orgId" value={orgId} />

        {categories.map((cat) => (
          <div key={cat.id} className="module-group">
            <h3 className="module-group-title">{cat.label}</h3>
            <div className="module-grid">
              {cat.keys.map((key) => {
                const mod = TENANT_MODULES[key];
                return (
                  <label key={key} className="module-check">
                    <input
                      type="checkbox"
                      name={`feature_${key}`}
                      defaultChecked={initial[key]}
                      disabled={isPending}
                    />
                    <span>
                      <strong>{mod.label}</strong>
                      <small>{mod.description}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}

        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? 'Saqlanmoqda...' : 'Modullarni saqlash'}
        </button>
      </form>
    </>
  );
}
