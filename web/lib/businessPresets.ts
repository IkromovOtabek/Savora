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
export const BUSINESS_FEATURE_PRESETS: Record<BusinessType, Partial<Record<FeatureKey, boolean>>> = {
  general: {},
  phone_shop: { nasiya: true, variant: true, creditKassa: true, transferred: true },
  electronics: { nasiya: true, variant: true, creditKassa: true, transferred: true, inventory: true },
  furniture: { nasiya: true, variant: true, creditKassa: true, mediaUpload: true },
  clothing: { nasiya: false, variant: false, creditKassa: false, inventory: true, mediaUpload: true },
  grocery: { daftar: true, nasiya: false, variant: false, creditKassa: false, inventory: true },
  building: { daftar: true, nasiya: false, variant: false, creditKassa: false, inventory: true, transferred: true },
  cosmetics: { nasiya: false, variant: false, creditKassa: false, inventory: true, mediaUpload: true },
  pharmacy: { nasiya: false, variant: false, creditKassa: false, inventory: true, transferred: true },
  auto_parts: { daftar: true, nasiya: false, variant: false, creditKassa: false, inventory: true },
  wholesale: { daftar: true, nasiya: false, variant: false, creditKassa: false, inventory: true, transferred: true },
  restaurant: { nasiya: false, variant: false, creditKassa: false, transferred: false, inventory: true, mediaUpload: true },
  service: { nasiya: false, variant: false, creditKassa: false, inventory: false, transferred: false },
};

export function presetFor(businessType?: string): Partial<Record<FeatureKey, boolean>> {
  if (businessType && businessType in BUSINESS_FEATURE_PRESETS) {
    return BUSINESS_FEATURE_PRESETS[businessType as BusinessType];
  }
  return BUSINESS_FEATURE_PRESETS.general;
}
