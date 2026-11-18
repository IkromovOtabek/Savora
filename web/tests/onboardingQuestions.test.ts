import { describe, it, expect } from 'vitest';
import {
  ONBOARDING_QUESTIONS,
  completeAnswers,
  defaultAnswers,
  isQuestionVisible,
  onboardingFeatureOverrides,
  parseOnboardingInput,
  planOnboarding,
  questionViews,
  storedAnswersFor,
  SETUP_CATEGORY_KEYS,
} from '@/lib/onboardingQuestions';
import { BUSINESS_FEATURE_PRESETS, SIGNUP_PRESET_EXTRAS } from '@/lib/businessPresets';
import {
  BUSINESS_TYPE_IDS,
  PRODUCT_FIELDS,
  PRODUCT_UNITS,
  orderedUnits,
  orgProductFields,
  productFieldsFor,
  type BusinessType,
} from '@/lib/businessTypes';
import { FEATURE_KEYS } from '@/lib/featureKeys';
import { defaultFeaturesForPlan, resolveOrgFeatures } from '@/lib/features';
import { onboardingOverridesFor, typeProductSetup } from '@/lib/orgUpdate';
import { getDictionary } from '@/lib/i18n/dict';

const TIERS = ['free', 'starter', 'pro', 'business'] as const;
const plan = (tier: string) => ({ tier, maxFilial: 1, maxUsers: 2 });

describe('savollar konfiguratsiyasi', () => {
  it('har turda 2–5 savol, kalitlar noyob, standart javob to\'g\'ri', () => {
    for (const bt of BUSINESS_TYPE_IDS) {
      const qs = ONBOARDING_QUESTIONS[bt];
      expect(qs.length, bt).toBeGreaterThanOrEqual(2);
      expect(qs.length, bt).toBeLessThanOrEqual(5);
      expect(new Set(qs.map((q) => q.key)).size).toBe(qs.length);
      for (const q of qs) {
        if (q.kind === 'choice') expect(q.options).toContain(q.default);
        if (q.kind === 'number') {
          expect(q.default).toBeGreaterThanOrEqual(q.min);
          expect(q.default).toBeLessThanOrEqual(q.max);
        }
        if (q.showIf) expect(qs.some((x) => x.key === q.showIf!.q && x.key !== q.key)).toBe(true);
      }
    }
  });

  it('har savol va variantning matni lug\'atda (uz va ru)', () => {
    for (const locale of ['uz', 'ru'] as const) {
      const d = getDictionary(locale);
      for (const bt of BUSINESS_TYPE_IDS) {
        const views = questionViews(bt, d);
        const texts = d.onboarding.questions[bt] as Record<string, { label: string }>;
        expect(Object.keys(texts).sort(), `${locale}/${bt}`).toEqual(ONBOARDING_QUESTIONS[bt].map((q) => q.key).sort());
        for (const v of views) {
          expect(v.label).not.toBe(v.key);
          expect(v.label.length).toBeGreaterThan(3);
          for (const o of v.options ?? []) expect(o.label, `${locale}/${bt}/${v.key}/${o.value}`).not.toBe(o.value);
          if (v.kind === 'number') expect(v.suffix).toBeTruthy();
        }
      }
      for (const k of SETUP_CATEGORY_KEYS) expect(d.onboarding.categories[k]).toBeTruthy();
    }
  });

  it('sex profili variantlari — catalog.industryProfiles nomlari', () => {
    const d = getDictionary('ru');
    const profile = questionViews('manufacturing', d).find((q) => q.key === 'profile')!;
    expect(profile.options!.find((o) => o.value === 'bakery')!.label).toBe(d.catalog.industryProfiles.bakery.label);
  });

  it('showIf: restoran xizmat haqi faqat ofitsant xizmatida, qadoq haqi faqat saboyda', () => {
    const qs = ONBOARDING_QUESTIONS.restaurant;
    const sc = qs.find((q) => q.key === 'serviceCharge')!;
    const pf = qs.find((q) => q.key === 'packFee')!;
    expect(isQuestionVisible(sc, { service: 'waiter' })).toBe(true);
    expect(isQuestionVisible(sc, { service: 'self' })).toBe(false);
    expect(isQuestionVisible(pf, { takeaway: false })).toBe(false);
    // Yashirin savol javobi standartga qaytadi
    expect(completeAnswers('restaurant', { service: 'self', serviceCharge: 15 }).serviceCharge).toBe(0);
  });
});

describe('standart javoblar = runtime preset + §4.3 qo\'shimchalari', () => {
  it('o\'tkazib yuborilsa (standart javob) modullar presetdan farq qilmaydi', () => {
    for (const bt of BUSINESS_TYPE_IDS) {
      for (const tier of TIERS) {
        expect(onboardingFeatureOverrides({ tier, businessType: bt, plan: planOnboarding(bt) }), `${bt}/${tier}`)
          .toEqual(onboardingFeatureOverrides({ tier, businessType: bt }));
      }
    }
  });

  it('§4.3: general +daftar +inventory, phone_shop +inventory — tarif ruxsat bergan doirada', () => {
    expect(SIGNUP_PRESET_EXTRAS.general).toMatchObject({ daftar: true, inventory: true });
    expect(SIGNUP_PRESET_EXTRAS.phone_shop).toMatchObject({ inventory: true });
    // free: daftar/inventory tarifda yo'q — hech narsa yoqilmaydi
    expect(onboardingFeatureOverrides({ tier: 'free', businessType: 'general' })).toEqual({});
    // starter: daftar ruxsat (allowedByPlan), inventory — yo'q
    expect(onboardingFeatureOverrides({ tier: 'starter', businessType: 'general' })).toEqual({ daftar: true });
    // pro: inventory standart yoqiq — faqat daftar farq qiladi
    expect(onboardingFeatureOverrides({ tier: 'pro', businessType: 'general' })).toEqual({ daftar: true });
    expect(onboardingFeatureOverrides({ tier: 'starter', businessType: 'phone_shop' })).toEqual({});
  });

  it('har qo\'shimcha kaliti mavjud modul', () => {
    for (const extra of Object.values(SIGNUP_PRESET_EXTRAS)) {
      for (const key of Object.keys(extra)) expect(FEATURE_KEYS as readonly string[]).toContain(key);
    }
  });
});

describe('MAVJUD do\'konlar o\'zgarmaydi', () => {
  it('runtime preset va mahsulot maydonlari o\'zgarmagan (org.features / extra yo\'q do\'kon)', () => {
    expect(BUSINESS_FEATURE_PRESETS.general).toEqual({ ai: true, tasks: true });
    expect(resolveOrgFeatures({ plan: plan('pro'), businessType: 'general' })).toEqual(defaultFeaturesForPlan('pro'));
    for (const bt of BUSINESS_TYPE_IDS) {
      expect(productFieldsFor(bt)).toEqual(PRODUCT_FIELDS[bt]);
      expect(orgProductFields({ businessType: bt })).toEqual(PRODUCT_FIELDS[bt]);
    }
    expect(orderedUnits(undefined)).toEqual([...PRODUCT_UNITS]);
  });

  it('tarif o\'zgarganda: ustasiz (eski) do\'kon — qo\'shimcha yo\'q; ustadan o\'tgan — javoblar saqlanadi', () => {
    const stored = { v: 1, businessType: 'phone_shop' as BusinessType, answers: { nasiya: false, bankCredit: true, used: true }, sampleData: false, at: new Date() };
    expect(onboardingOverridesFor({ onboardingAnswers: stored }, 'business', 'phone_shop')).toEqual({ nasiya: false, variant: false });
    // Tur boshqa — eski turning javoblari qo'llanmaydi
    expect(onboardingOverridesFor({ onboardingAnswers: stored }, 'pro', 'grocery')).toEqual({});
    expect(storedAnswersFor(stored, 'grocery')).toBeNull();
  });

  it('tur o\'zgarsa — mahsulot maydonlari/birliklar yangi tur bo\'yicha', () => {
    expect(typeProductSetup({}, 'auto_parts')).toEqual({ productFieldsExtra: ['unit', 'warrantyMonths'], preferredUnits: ['dona', 'l', 'juft', 'm', 'kg'] });
    expect(typeProductSetup({}, 'pharmacy')).toEqual({ productFieldsExtra: undefined, preferredUnits: undefined });
  });
});

describe('javob → sozlama', () => {
  it('telefon: nasiyaga sotmayman → nasiya va nasiya sotuvi o\'chiq; b/u yo\'q → kategoriya yo\'q', () => {
    const p = planOnboarding('phone_shop', { nasiya: false, used: false });
    expect(p.features).toMatchObject({ nasiya: false, variant: false, creditKassa: true });
    expect(p.categories).toEqual(['phonesNew', 'accessories']);
    expect(onboardingFeatureOverrides({ tier: 'pro', businessType: 'phone_shop', plan: p })).toEqual({ nasiya: false, variant: false });
  });

  it('oziq-ovqat: qarzga bermayman → daftar o\'chiq; tarozi → kg birinchi; muddat 7 kun', () => {
    const p = planOnboarding('grocery', { debt: false });
    expect(onboardingFeatureOverrides({ tier: 'pro', businessType: 'grocery', plan: p })).toEqual({ daftar: false });
    expect(p.units[0]).toBe('kg');
    expect(p.expiryWarnDays).toBe(7);
    expect(planOnboarding('cosmetics').expiryWarnDays).toBe(30);
    expect(planOnboarding('pharmacy').expiryWarnDays).toBe(90);
  });

  it('tarif ruxsat bermagan modul yoqilmaydi (o\'chirish — har doim)', () => {
    // free'da nasiya yo'q — «ha» desa ham yoqilmaydi
    const p = planOnboarding('manufacturing', { sales: 'customers', pay: 'piece' });
    expect(p.features).toMatchObject({ nasiya: true, variant: true });
    const free = onboardingFeatureOverrides({ tier: 'free', businessType: 'manufacturing', plan: p });
    expect(free.nasiya).toBeUndefined();
    expect(free.piecework).toBeUndefined();
    // pro: nasiya standart yoqiq; sex presetida o'chiq «nasiya sotuvi» (variant) yoqiladi
    expect(onboardingFeatureOverrides({ tier: 'pro', businessType: 'manufacturing', plan: p })).toEqual({ variant: true });
    // Oylik → ishbay o'chiq
    expect(onboardingFeatureOverrides({ tier: 'pro', businessType: 'manufacturing', plan: planOnboarding('manufacturing', { pay: 'salary' }) }))
      .toEqual({ piecework: false });
  });

  it('sex (§2.3): profil → industryProfile va birliklar; alohida saqlash → 2 ombor', () => {
    const p = planOnboarding('manufacturing', { profile: 'furniture_shop', warehouses: true });
    expect(p.industryProfile).toBe('furniture_shop');
    expect(p.units).toEqual(['list', 'm2', 'm', 'dona']);
    expect(p.warehouses).toBe(true);
    expect(planOnboarding('manufacturing', { warehouses: false }).warehouses).toBe(false);
  });

  it('restoran: ofitsant + xizmat haqi, o\'zi xizmatda 0; saboy yo\'q → qadoq 0', () => {
    expect(planOnboarding('restaurant', { service: 'waiter', serviceCharge: 12.5, bar: true, takeaway: true, packFee: 2000 }).restaurant)
      .toEqual({ waiter: true, bar: true, takeaway: true, serviceChargePct: 12.5, takeawayPackFee: 2000 });
    expect(planOnboarding('restaurant', { service: 'self', serviceCharge: 15, takeaway: false, packFee: 3000 }).restaurant)
      .toEqual({ waiter: false, bar: false, takeaway: false, serviceChargePct: 0, takeawayPackFee: 0 });
    // Restoran javoblari modullarni o'zgartirmaydi (stollar/oshxona — preset)
    expect(planOnboarding('restaurant', { service: 'self', bar: true }).features).toEqual({});
  });

  it('xizmat markazi: avtoservis/ustaxona → inventar va maydonlar; salon — ombor o\'chiq', () => {
    const auto = planOnboarding('service', { kind: 'auto' });
    expect(auto.features.inventory).toBe(true);
    expect(auto.productFields).toEqual(['oemCode']);
    expect(onboardingFeatureOverrides({ tier: 'pro', businessType: 'service', plan: auto })).toEqual({ inventory: true });
    const repair = planOnboarding('service', { kind: 'repair' });
    expect(repair.productFields).toEqual(['warrantyMonths']);
    expect(repair.receiptNote).toBe('warranty');
    expect(planOnboarding('service', { kind: 'salon' }).features.inventory).toBeUndefined();
    expect(planOnboarding('service', { kind: 'salon', materials: true }).features.inventory).toBe(true);
    // «materials» faqat salon/boshqada so'raladi — avtoservisda yashirin, javobi e'tiborsiz
    expect(completeAnswers('service', { kind: 'auto', materials: true }).materials).toBe(false);
  });

  it('mahsulot maydonlari: tartib PRODUCT_FIELD_KEYS bo\'yicha, orgProductFields qo\'shadi', () => {
    const p = planOnboarding('auto_parts');
    expect(p.productFields).toEqual(['unit', 'warrantyMonths']);
    expect(orgProductFields({ businessType: 'auto_parts', productFieldsExtra: p.productFields }).map((f) => f.key))
      .toEqual(['category', 'oemCode', 'unit', 'warrantyMonths']);
    // Turda allaqachon bor maydon takrorlanmaydi
    expect(productFieldsFor('grocery', ['unit']).map((f) => f.key)).toEqual(['category', 'unit', 'expiryDate']);
    expect(orderedUnits(['kg', 'l']).slice(0, 3)).toEqual(['kg', 'l', 'dona']);
  });

  it('kiyim: faqat kiyim → poyabzal kategoriyasi va «juft» yo\'q; almashtirish → chek matni', () => {
    const p = planOnboarding('clothing', { kind: 'clothes' });
    expect(p.categories).toEqual(['clothes', 'accessories']);
    expect(p.units).toEqual([]);
    expect(p.receiptNote).toBe('exchange10');
    expect(planOnboarding('clothing', { kind: 'shoes', exchange: false }).receiptNote).toBeNull();
  });
});

describe('validatsiya (parseOnboardingInput)', () => {
  it('bo\'sh / yo\'q — standart javoblar', () => {
    expect(parseOnboardingInput('grocery', '')).toEqual({ ok: true, answers: defaultAnswers('grocery'), sampleData: false });
    expect(parseOnboardingInput('grocery', undefined)).toMatchObject({ ok: true, sampleData: false });
  });

  it('JSON matn (web yashirin maydon) va obyekt (mobil)', () => {
    const r = parseOnboardingInput('restaurant', JSON.stringify({ answers: { service: 'self', bar: true }, sampleData: true }));
    expect(r).toMatchObject({ ok: true, sampleData: true, answers: { service: 'self', bar: true, serviceCharge: 0 } });
    expect(parseOnboardingInput('restaurant', { answers: { serviceCharge: 10 } })).toMatchObject({ ok: true, answers: { serviceCharge: 10 } });
  });

  it('noto\'g\'ri qiymat — qaysi savol ekani', () => {
    expect(parseOnboardingInput('grocery', { answers: { debt: 'ha' } })).toEqual({ ok: false, key: 'debt' });
    expect(parseOnboardingInput('grocery', { answers: { expiryDays: 0 } })).toEqual({ ok: false, key: 'expiryDays' });
    expect(parseOnboardingInput('restaurant', { answers: { serviceCharge: 31 } })).toEqual({ ok: false, key: 'serviceCharge' });
    expect(parseOnboardingInput('restaurant', { answers: { service: 'robot' } })).toEqual({ ok: false, key: 'service' });
    expect(parseOnboardingInput('manufacturing', { answers: { profile: 'space' } })).toEqual({ ok: false, key: 'profile' });
    expect(parseOnboardingInput('grocery', '{bad json')).toEqual({ ok: false, key: null });
    expect(parseOnboardingInput('grocery', { answers: [], sampleData: 'yes' })).toEqual({ ok: false, key: null });
  });

  it('boshqa turning (noma\'lum) kalitlari tashlanadi', () => {
    const r = parseOnboardingInput('general', { answers: { serviceCharge: 10, debt: false } });
    expect(r).toEqual({ ok: true, answers: { ...defaultAnswers('general'), debt: false }, sampleData: false });
  });
});
