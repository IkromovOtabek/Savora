import { describe, it, expect } from 'vitest';
import { parsePlanTier, fmtPlanPrice, getPlanPreset } from '@/lib/plans';
import { defaultFeaturesForPlan, resolveOrgFeatures } from '@/lib/features';

describe('plans — tarif presetlari', () => {
  it('parsePlanTier noma\'lum qiymatni pro\'ga keltiradi', () => {
    expect(parsePlanTier('free')).toBe('free');
    expect(parsePlanTier('business')).toBe('business');
    expect(parsePlanTier('xxx')).toBe('pro');
  });

  it('fmtPlanPrice 0 ni "Bepul" qiladi', () => {
    expect(fmtPlanPrice(0)).toBe('Bepul');
    expect(fmtPlanPrice(99000)).toContain('99');
  });

  it('getPlanPreset har tier uchun preset qaytaradi', () => {
    expect(getPlanPreset('free').tier).toBe('free');
    expect(getPlanPreset('business').maxFilial).toBeGreaterThan(1);
  });
});

describe('features — tarifga qarab modullar', () => {
  it('free tarif cheklangan modullar', () => {
    const f = defaultFeaturesForPlan('free');
    expect(f.sales).toBe(true);
    expect(f.products).toBe(true);
    expect(f.monitoring).toBe(false); // hisobot free\'da yo\'q
    expect(f.creditKassa).toBe(false);
  });

  it('pro tarif kengaytirilgan modullar', () => {
    const f = defaultFeaturesForPlan('pro');
    expect(f.monitoring).toBe(true);
    expect(f.inventory).toBe(true);
    expect(f.export).toBe(true);
  });

  it('resolveOrgFeatures org override\'ni qo\'llaydi', () => {
    const features = resolveOrgFeatures({ plan: { tier: 'free', maxFilial: 1, maxUsers: 2 }, features: { monitoring: true } });
    expect(features.monitoring).toBe(true); // override
    expect(features.sales).toBe(true);
  });

  it('resolveOrgFeatures override yo\'q bo\'lsa default', () => {
    const features = resolveOrgFeatures({ plan: { tier: 'free', maxFilial: 1, maxUsers: 2 } });
    expect(features.monitoring).toBe(false);
  });
});
