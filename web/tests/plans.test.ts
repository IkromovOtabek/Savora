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

  it('oyiga ekvivalent: N oylik summa / N, 100 so\'mga yaxlit', async () => {
    const { prepayPerMonth } = await import('@/lib/plans');
    expect(prepayPerMonth(249_000, 6)).toBe(223_300); // 1 340 000 / 6 = 223 333
    expect(prepayPerMonth(249_000, 12)).toBe(207_500); // 2 490 000 / 12
    expect(prepayPerMonth(649_000, 6)).toBe(583_300); // 3 500 000 / 6 = 583 333
    expect(prepayPerMonth(649_000, 12)).toBe(540_800); // 6 490 000 / 12 = 540 833
    expect(prepayPerMonth(1_290_000, 6)).toBe(1_160_000);
    expect(prepayPerMonth(1_290_000, 12)).toBe(1_075_000);
    expect(prepayPerMonth(249_000, 1)).toBe(249_000);
    expect(prepayPerMonth(0, 6)).toBe(0);
  });

  it('cyclePrice: kartadagi narx tanlangan davr bo\'yicha', async () => {
    const { cyclePrice } = await import('@/lib/plans');
    expect(cyclePrice(249_000, 'monthly')).toEqual({ months: 1, total: 249_000, perMonth: 249_000, pct: 0, freeMonths: 0 });
    expect(cyclePrice(249_000, 'semiannual')).toEqual({ months: 6, total: 1_340_000, perMonth: 223_300, pct: 10, freeMonths: 0 });
    expect(cyclePrice(249_000, 'yearly')).toEqual({ months: 12, total: 2_490_000, perMonth: 207_500, pct: 17, freeMonths: 2 });
    expect(cyclePrice(0, 'yearly').total).toBe(0);
  });
});

describe('plans — to\'lov davri (billingCycle)', () => {
  it('parseBillingCycle: noma\'lum/bo\'sh qiymat — oylik', async () => {
    const { parseBillingCycle } = await import('@/lib/plans');
    expect(parseBillingCycle('monthly')).toBe('monthly');
    expect(parseBillingCycle('semiannual')).toBe('semiannual');
    expect(parseBillingCycle('yearly')).toBe('yearly');
    expect(parseBillingCycle(null)).toBe('monthly'); // FormData.get — maydon yo'q
    expect(parseBillingCycle(undefined)).toBe('monthly'); // eski yozuv
    expect(parseBillingCycle('')).toBe('monthly');
    expect(parseBillingCycle('weekly')).toBe('monthly');
    expect(parseBillingCycle(12)).toBe('monthly');
  });

  it('davr ↔ oylar soni (to\'lov formasidagi tez tanlash)', async () => {
    const { BILLING_CYCLE_MONTHS, billingCycleFromMonths } = await import('@/lib/plans');
    expect(BILLING_CYCLE_MONTHS).toEqual({ monthly: 1, semiannual: 6, yearly: 12 });
    expect(billingCycleFromMonths(1)).toBe('monthly');
    expect(billingCycleFromMonths(6)).toBe('semiannual');
    expect(billingCycleFromMonths(12)).toBe('yearly');
    expect(billingCycleFromMonths(3)).toBeNull();
    expect(billingCycleFromMonths(24)).toBeNull();
  });

  it('Mongoose enum barcha davrlarni qabul qiladi, standart — oylik', async () => {
    const { BILLING_CYCLES } = await import('@/lib/plans');
    const { organizationSchema } = await import('@/lib/models/master/Organization');
    const path = organizationSchema.path('plan.billingCycle') as unknown as { enumValues: string[]; defaultValue: unknown };
    expect([...path.enumValues].sort()).toEqual([...BILLING_CYCLES].sort());
    expect(path.enumValues).toContain('yearly'); // eski yozuvlar buzilmaydi
    expect(path.defaultValue).toBe('monthly');
  });
});
