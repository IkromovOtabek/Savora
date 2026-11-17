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

describe('plans — oldindan to\'lov (6 oy / 1 yil)', () => {
  it('1–5 oy chegirmasiz, 6 oy −10%, 12 oy = 10 oy narxi (10 000 ga pastga yaxlit)', async () => {
    const { prepayAmount } = await import('@/lib/plans');
    expect(prepayAmount(249_000, 1)).toBe(249_000);
    expect(prepayAmount(249_000, 5)).toBe(1_245_000);
    expect(prepayAmount(249_000, 6)).toBe(1_340_000);
    expect(prepayAmount(649_000, 6)).toBe(3_500_000);
    expect(prepayAmount(1_290_000, 6)).toBe(6_960_000);
    expect(prepayAmount(249_000, 12)).toBe(2_490_000);
    expect(prepayAmount(649_000, 12)).toBe(6_490_000);
    expect(prepayAmount(1_290_000, 12)).toBe(12_900_000);
    expect(prepayAmount(249_000, 24)).toBe(4_980_000);
    expect(prepayAmount(0, 12)).toBe(0);
  });

  it('tejash: 12 oy — 2 oy bepul, 6 oy — 10%', async () => {
    const { prepaySaving } = await import('@/lib/plans');
    expect(prepaySaving(249_000, 12)).toEqual({ pct: 17, freeMonths: 2 });
    expect(prepaySaving(649_000, 6)).toEqual({ pct: 10, freeMonths: 0 });
    expect(prepaySaving(249_000, 3)).toEqual({ pct: 0, freeMonths: 0 });
  });
});
