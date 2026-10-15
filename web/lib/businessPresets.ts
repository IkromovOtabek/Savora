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
  wholesale: { ...SMART, daftar: true, nasiya: false, variant: false, creditKassa: false, inventory: true, transferred: true },
  restaurant: { ...SMART, nasiya: false, variant: false, creditKassa: false, transferred: false, inventory: true, mediaUpload: true },
  service: { ...SMART, nasiya: false, variant: false, creditKassa: false, inventory: false, transferred: false },
};

export function presetFor(businessType?: string): Partial<Record<FeatureKey, boolean>> {
  if (businessType && businessType in BUSINESS_FEATURE_PRESETS) {
    return BUSINESS_FEATURE_PRESETS[businessType as BusinessType];
  }
  return BUSINESS_FEATURE_PRESETS.general;
}
