import { describe, it, expect } from 'vitest';
import {
  baseOrgFeatures,
  defaultFeaturesForPlan,
  diffFeatureOverrides,
  explainOrgFeatures,
  planAllows,
  resolveOrgFeatures,
} from '@/lib/features';
import { BUSINESS_FEATURE_PRESETS } from '@/lib/businessPresets';
import { BUSINESS_TYPE_IDS, BUSINESS_TYPES, TERMS, parseBusinessType, isPhoneShop } from '@/lib/businessTypes';
import { FEATURE_KEYS } from '@/lib/featureKeys';
import { organizationSchema } from '@/lib/models/master/Organization';

const plan = (tier: string) => ({ tier, maxFilial: 1, maxUsers: 2 });

describe('Biznes turlari — yagona ro\'yxat', () => {
  it('har turda label, ikonka, TERMS va preset bor', () => {
    for (const id of BUSINESS_TYPE_IDS) {
      expect(BUSINESS_TYPES[id].label).toBeTruthy();
      expect(BUSINESS_TYPES[id].icon).toBeTruthy();
      expect(TERMS[id].item).toBeTruthy();
      expect(BUSINESS_FEATURE_PRESETS[id]).toBeDefined();
    }
  });

  it('eski id\'lar saqlangan, yangilari qo\'shilgan', () => {
    for (const id of ['general', 'phone_shop', 'restaurant', 'wholesale', 'service', 'pharmacy', 'auto_parts',
      'electronics', 'furniture', 'clothing', 'building', 'grocery', 'cosmetics']) {
      expect(parseBusinessType(id)).toBe(id);
    }
    expect(parseBusinessType('xxx')).toBe('general');
  });

  it('Mongoose enum barcha turlarni qabul qiladi', () => {
    const path = organizationSchema.path('businessType') as unknown as { enumValues: string[] };
    expect([...path.enumValues].sort()).toEqual([...BUSINESS_TYPE_IDS].sort());
  });

  it('presetda faqat mavjud modul kalitlari', () => {
    for (const preset of Object.values(BUSINESS_FEATURE_PRESETS)) {
      for (const key of Object.keys(preset)) expect(FEATURE_KEYS as readonly string[]).toContain(key);
    }
  });

  it('IMEI faqat telefon do\'konda', () => {
    expect(isPhoneShop({ businessType: 'phone_shop' })).toBe(true);
    expect(isPhoneShop({ businessType: 'electronics' })).toBe(false);
    expect(isPhoneShop({})).toBe(false);
  });
});

describe('resolveOrgFeatures — tarif → preset → override', () => {
  it('general = tarif standarti (preset bo\'sh)', () => {
    expect(resolveOrgFeatures({ plan: plan('pro'), businessType: 'general' })).toEqual(defaultFeaturesForPlan('pro'));
  });

  it('restoran: nasiya/variant/kredit o\'chadi, inventar yoqiq', () => {
    const f = resolveOrgFeatures({ plan: plan('pro'), businessType: 'restaurant' });
    expect(f.nasiya).toBe(false);
    expect(f.variant).toBe(false);
    expect(f.creditKassa).toBe(false);
    expect(f.inventory).toBe(true);
    expect(f.sales).toBe(true);
  });

  it('telefon do\'kon pro: nasiya + variant + kredit + transfer', () => {
    const f = resolveOrgFeatures({ plan: plan('pro'), businessType: 'phone_shop' });
    expect(f.nasiya && f.variant && f.creditKassa && f.transferred).toBe(true);
  });

  it('oziq-ovqat: daftar yoqiq (standart OFF bo\'lsa ham), nasiya o\'chiq', () => {
    const f = resolveOrgFeatures({ plan: plan('starter'), businessType: 'grocery' });
    expect(f.daftar).toBe(true);
    expect(f.nasiya).toBe(false);
  });

  it('preset tarif RUXSAT bermagan modulni yoqmaydi (free)', () => {
    expect(planAllows('free', 'nasiya')).toBe(false);
    const f = resolveOrgFeatures({ plan: plan('free'), businessType: 'electronics' });
    expect(f.nasiya).toBe(false);
    expect(f.creditKassa).toBe(false);
    const g = resolveOrgFeatures({ plan: plan('free'), businessType: 'grocery' });
    expect(g.daftar).toBe(false);
    expect(g.inventory).toBe(false);
  });

  it('Super Admin override eng ustun (tarif ruxsat bermasa ham)', () => {
    const f = resolveOrgFeatures({ plan: plan('free'), businessType: 'restaurant', features: { nasiya: true, sales: false } });
    expect(f.nasiya).toBe(true);
    expect(f.sales).toBe(false);
  });

  it('eski (to\'liq saqlangan) features o\'zgarmaydi — orqaga moslik', () => {
    const legacy = defaultFeaturesForPlan('pro');
    const f = resolveOrgFeatures({ plan: plan('pro'), businessType: 'restaurant', features: legacy });
    expect(f).toEqual(legacy);
  });

  it('noma\'lum biznes turi — general kabi', () => {
    expect(baseOrgFeatures({ plan: plan('pro'), businessType: 'nimadir' })).toEqual(defaultFeaturesForPlan('pro'));
  });
});

describe('explain / diff — Super Admin UI', () => {
  it('manbani to\'g\'ri ko\'rsatadi', () => {
    const ex = explainOrgFeatures({ plan: plan('pro'), businessType: 'grocery', features: { kassa: false } });
    expect(ex.daftar).toMatchObject({ enabled: true, source: 'preset' });
    expect(ex.sales).toMatchObject({ enabled: true, source: 'plan' });
    expect(ex.kassa).toMatchObject({ enabled: false, source: 'override', base: true });
  });

  it('bazaga teng override "override" hisoblanmaydi', () => {
    const ex = explainOrgFeatures({ plan: plan('pro'), businessType: 'general', features: { sales: true } });
    expect(ex.sales.source).toBe('plan');
  });

  it('diff faqat farqlarni saqlaydi', () => {
    const org = { plan: plan('pro'), businessType: 'restaurant' };
    const wanted = { ...baseOrgFeatures(org), nasiya: true };
    expect(diffFeatureOverrides(org, wanted)).toEqual({ nasiya: true });
    expect(diffFeatureOverrides(org, baseOrgFeatures(org))).toEqual({});
  });
});
