import type { BusinessType } from './businessTypes';
import type { FeatureKey } from './featureKeys';

/**
 * Biznes turi → modul PRESETI (yagona joy).
 *
 * Har bir kalit faqat tarif standartidan FARQ qiladigan modullarni yozadi:
 *   true  — bu biznesga kerak: tarif RUXSAT bersa yoqiladi (planAllows)
 *   false — bu biznesga kerak emas: o'chiriladi (menyuni soddalashtiradi)
 *   yozilmagan — tarif standarti qoladi
 *
 * Yechim tartibi (lib/features.ts → resolveOrgFeatures):
 *   1) tarif standarti (defaultByPlan)
 *   2) biznes preseti (true faqat tarif ruxsat bersa)
 *   3) org.features — Super Admin'ning aniq qo'lda o'zgartirishlari (eng ustun)
 */
/** AI yordamchi va Topshiriqlar — barcha yo'nalishlarga foydali (tarif ruxsat bersa yoqiladi) */
const SMART: Partial<Record<FeatureKey, boolean>> = { ai: true, tasks: true };

export const BUSINESS_FEATURE_PRESETS: Record<BusinessType, Partial<Record<FeatureKey, boolean>>> = {
  general: { ...SMART },
  phone_shop: { ...SMART, nasiya: true, variant: true, creditKassa: true, transferred: true },
  electronics: { ...SMART, nasiya: true, variant: true, creditKassa: true, transferred: true, inventory: true },
  furniture: { ...SMART, nasiya: true, variant: true, creditKassa: true, mediaUpload: true },
  clothing: { ...SMART, nasiya: false, variant: false, creditKassa: false, inventory: true, mediaUpload: true },
  grocery: { ...SMART, daftar: true, nasiya: false, variant: false, creditKassa: false, inventory: true },
  building: { ...SMART, daftar: true, nasiya: false, variant: false, creditKassa: false, inventory: true, transferred: true },
  cosmetics: { ...SMART, nasiya: false, variant: false, creditKassa: false, inventory: true, mediaUpload: true },
  pharmacy: { ...SMART, nasiya: false, variant: false, creditKassa: false, inventory: true, transferred: true },
  auto_parts: { ...SMART, daftar: true, nasiya: false, variant: false, creditKassa: false, inventory: true },
  wholesale: { ...SMART, daftar: true, nasiya: false, variant: false, creditKassa: false, inventory: true, transferred: true, purchasing: true },
  restaurant: { ...SMART, nasiya: false, variant: false, creditKassa: false, transferred: false, inventory: true, mediaUpload: true, tables: true, kitchen: true, qrMenu: true },
  service: { ...SMART, nasiya: false, variant: false, creditKassa: false, inventory: false, transferred: false },
  // Sex: texkarta/akt/tannarx, kirim va xaridlar, ishbay (Pro+), ikki ombor (xom ashyo → tayyor mahsulot), diler qarzi
  manufacturing: {
    ...SMART, production: true, purchasing: true, piecework: true, inventory: true, transferred: true, daftar: true,
    variant: false, creditKassa: false,
  },
};

export function presetFor(businessType?: string): Partial<Record<FeatureKey, boolean>> {
  if (businessType && businessType in BUSINESS_FEATURE_PRESETS) {
    return BUSINESS_FEATURE_PRESETS[businessType as BusinessType];
  }
  return BUSINESS_FEATURE_PRESETS.general;
}

/**
 * YANGI do'konlar uchun preset qo'shimchalari (TAKLIF_2026-11 §4.3, «Ro'yxatdan o'tishda qo'shimcha»).
 *
 * BUSINESS_FEATURE_PRESETS runtime'da (har so'rovda) hisoblanadi — uni o'zgartirsak MAVJUD do'konlarning
 * modullari ham o'zgarardi. Shuning uchun §4.3 farqlari shu yerda: ular faqat
 *   - ro'yxatdan o'tishda (web/mobil, super admin «yangi do'kon») va
 *   - Super Admin biznes turi presetini qo'llaganda (applyBusinessPresetAction)
 * org.features ga yoziladi (lib/onboardingQuestions.ts → onboardingFeatureOverrides; `true` — tarif ruxsat bersa).
 * Ustaning javoblari bularni bekor qilishi mumkin (masalan, «Qarzga bermayman» → daftar o'chiq).
 * Yo'nalishga xos mahsulot maydonlari — lib/businessTypes.ts → SIGNUP_PRODUCT_FIELDS.
 */
export const SIGNUP_PRESET_EXTRAS: Record<BusinessType, Partial<Record<FeatureKey, boolean>>> = {
  // Mahalla nasiyasi → daftar; tovar tugashi → inventarizatsiya
  general: { daftar: true, inventory: true },
  // IMEI, narx o'zgarishi nazorati — inventarizatsiya va amallar tarixi
  phone_shop: { inventory: true, audit: true },
  electronics: {},
  // Ko'rgazma zali ↔ ombor
  furniture: { transferred: true },
  clothing: {},
  grocery: {},
  building: {},
  cosmetics: {},
  pharmacy: {},
  auto_parts: {},
  wholesale: {},
  restaurant: {},
  // Kichik tur (salon / avtoservis / ustaxona) ustaning savoli bilan aniqlanadi
  service: {},
  manufacturing: {},
};
