import { PlanTier } from './plans';
import { isPhoneShop } from './businessTypes';
import { presetFor } from './businessPresets';
import {
  FEATURE_KEYS,
  type FeatureKey,
  type OrgFeatureSource,
  type OrgFeatures,
  TENANT_COLLECTIONS,
} from './featureKeys';

export { FEATURE_KEYS, TENANT_COLLECTIONS };
export type { FeatureKey, OrgFeatureSource, OrgFeatures };
export { parseFeaturesFromForm } from './featuresForm';

export interface FeatureModule {
  key: FeatureKey;
  label: string;
  description: string;
  route: string;
  adminOnly?: boolean;
  category: 'savdo' | 'ombor' | 'boshqaruv' | 'hisobot';
  defaultByPlan: Record<PlanTier, boolean>;
  /** Biznes preseti yoqa oladigan tariflar (bo'lmasa = defaultByPlan) */
  allowedByPlan?: Record<PlanTier, boolean>;
}

const ALL_PLANS: Record<PlanTier, boolean> = {
  free: true,
  starter: true,
  pro: true,
  business: true,
  custom: true,
};

export const TENANT_MODULES: Record<FeatureKey, FeatureModule> = {
  sales: {
    key: 'sales',
    label: 'Sotuv',
    description: 'Mahsulot sotish — naqd, qarz, nasiya',
    route: '/app/sales',
    category: 'savdo',
    defaultByPlan: { ...ALL_PLANS },
  },
  kassa: {
    key: 'kassa',
    label: 'Kassa',
    description: 'Kunlik tushum va to\'lovlar',
    route: '/app/kassa',
    category: 'savdo',
    defaultByPlan: { ...ALL_PLANS },
  },
  variant: {
    key: 'variant',
    label: 'Nasiya sotuvi',
    description: 'Bo\'lib to\'lash (nasiya) sotuvda',
    route: '/app/sales/new',
    category: 'savdo',
    defaultByPlan: { free: false, starter: false, pro: true, business: true, custom: true },
  },
  creditKassa: {
    key: 'creditKassa',
    label: 'Kredit kassa',
    description: 'Bank krediti va biznes banklari',
    route: '/app/kredit-kassa',
    category: 'savdo',
    adminOnly: true,
    defaultByPlan: { free: false, starter: false, pro: true, business: true, custom: true },
  },
  kirimChiqim: {
    key: 'kirimChiqim',
    label: 'Kirim-Chiqim',
    description: 'Kirim va chiqimlar jurnali',
    route: '/app/kirim-chiqim',
    category: 'boshqaruv',
    adminOnly: true,
    defaultByPlan: { free: false, starter: false, pro: true, business: true, custom: true },
  },
  monitoring: {
    key: 'monitoring',
    label: 'Hisobot',
    description: 'Foyda va sotuv statistikasi',
    route: '/app/monitoring',
    category: 'hisobot',
    defaultByPlan: { free: false, starter: false, pro: true, business: true, custom: true },
  },
  products: {
    key: 'products',
    label: 'Ombor',
    description: 'Mahsulotlar va narxlar',
    route: '/app/products',
    category: 'ombor',
    defaultByPlan: { ...ALL_PLANS },
  },
  inventory: {
    key: 'inventory',
    label: 'Inventarizatsiya',
    description: 'Ombordagi qoldiqni tekshirish',
    route: '/app/inventory',
    category: 'ombor',
    defaultByPlan: { free: false, starter: false, pro: true, business: true, custom: true },
  },
  users: {
    key: 'users',
    label: 'Jamoa',
    description: 'Xodimlar va filiallar',
    route: '/app/users',
    adminOnly: true,
    category: 'boshqaruv',
    defaultByPlan: { ...ALL_PLANS },
  },
  export: {
    key: 'export',
    label: 'Eksport',
    description: 'CSV faylga yuklab olish',
    route: '/api/export/products',
    category: 'hisobot',
    defaultByPlan: { free: false, starter: false, pro: true, business: true, custom: true },
  },
  mediaUpload: {
    key: 'mediaUpload',
    label: 'Rasm / kamera',
    description: 'Ombor, mijoz va sotuvga rasm yuklash',
    route: '/app/products',
    category: 'boshqaruv',
    defaultByPlan: { free: false, starter: false, pro: true, business: true, custom: true },
  },
  transferred: {
    key: 'transferred',
    label: 'Filialga berildi',
    description: 'Filiallar aro berilgan mahsulotlar ro\'yxati',
    route: '/app/transferred',
    category: 'ombor',
    defaultByPlan: { ...ALL_PLANS },
  },
  audit: {
    key: 'audit',
    label: 'Amallar',
    description: 'Xodimlar amallari tarixi (kim, qachon, nima qildi)',
    route: '/app/audit',
    category: 'boshqaruv',
    adminOnly: true,
    defaultByPlan: { ...ALL_PLANS },
  },
  daftar: {
    key: 'daftar',
    label: 'Daftar',
    description: 'Shaxsiy qarz daftari — qarz oldi-berdi, muddat eslatmasi (SMS + Telegram)',
    route: '/app/daftar',
    category: 'boshqaruv',
    // Standart OFF — Super Admin yoki biznes preseti (oziq-ovqat, qurilish, optom...) yoqadi
    defaultByPlan: { free: false, starter: false, pro: false, business: false, custom: false },
    allowedByPlan: { free: false, starter: true, pro: true, business: true, custom: true },
  },
  nasiya: {
    key: 'nasiya',
    label: 'Nasiya',
    description: 'Bo\'lib to\'lash sotuvlari — summa, oy soni, mijoz va izoh',
    route: '/app/nasiya',
    category: 'savdo',
    defaultByPlan: { free: false, starter: false, pro: true, business: true, custom: true },
  },
  ai: {
    key: 'ai',
    label: 'AI yordamchi',
    description: 'Savdo, ombor va nasiya bo\'yicha avtomatik tahlil, tavsiya va topshiriqlar',
    route: '/app/ai',
    category: 'hisobot',
    defaultByPlan: { free: false, starter: false, pro: true, business: true, custom: true },
  },
  tasks: {
    key: 'tasks',
    label: 'Topshiriqlar',
    description: 'Jamoa uchun topshiriqlar: kim, qachongacha, holati',
    route: '/app/tasks',
    category: 'boshqaruv',
    defaultByPlan: { free: false, starter: true, pro: true, business: true, custom: true },
  },
};

const CATEGORY_LABELS: Record<FeatureModule['category'], string> = {
  savdo: 'Savdo',
  ombor: 'Ombor',
  boshqaruv: 'Jamoa',
  hisobot: 'Hisobot',
};

export function getFeatureCategories(): { id: FeatureModule['category']; label: string; keys: FeatureKey[] }[] {
  const map = new Map<FeatureModule['category'], FeatureKey[]>();
  for (const mod of Object.values(TENANT_MODULES)) {
    const list = map.get(mod.category) ?? [];
    list.push(mod.key);
    map.set(mod.category, list);
  }
  return [...map.entries()].map(([id, keys]) => ({ id, label: CATEGORY_LABELS[id], keys }));
}

function planTierOf(tier: string): PlanTier {
  return (['free', 'starter', 'pro', 'business', 'custom'].includes(tier) ? tier : 'pro') as PlanTier;
}

export function defaultFeaturesForPlan(tier: string): OrgFeatures {
  const plan = planTierOf(tier);
  const features = {} as OrgFeatures;
  for (const key of FEATURE_KEYS) {
    features[key] = TENANT_MODULES[key].defaultByPlan[plan];
  }
  return features;
}

/** Tarif bu modulni biznes preseti orqali yoqishga ruxsat beradimi */
export function planAllows(tier: string, key: FeatureKey): boolean {
  const plan = planTierOf(tier);
  const mod = TENANT_MODULES[key];
  return (mod.allowedByPlan ?? mod.defaultByPlan)[plan];
}

/** Tarif standarti + biznes preseti (Super Admin override'larisiz) */
export function baseOrgFeatures(org: Pick<OrgFeatureSource, 'plan' | 'businessType'>): OrgFeatures {
  const base = defaultFeaturesForPlan(org.plan.tier);
  const preset = presetFor(org.businessType);
  for (const key of FEATURE_KEYS) {
    const want = preset[key];
    if (want === false) base[key] = false;
    else if (want === true && planAllows(org.plan.tier, key)) base[key] = true;
  }
  return base;
}

/**
 * Yakuniy modullar. Tartib: tarif standarti → biznes preseti → org.features (Super Admin).
 * org.features — faqat aniq (boolean) qiymatlar ustun; qolganlari preset/tarifdan.
 */
export function resolveOrgFeatures(org: OrgFeatureSource): OrgFeatures {
  const resolved = baseOrgFeatures(org);
  if (!org.features) return resolved;
  for (const key of FEATURE_KEYS) {
    if (typeof org.features[key] === 'boolean') resolved[key] = org.features[key]!;
  }
  return resolved;
}

export type FeatureSource = 'plan' | 'preset' | 'override';
export type FeatureExplain = Record<FeatureKey, { enabled: boolean; source: FeatureSource; base: boolean }>;

/** Har modul qiymati qayerdan kelgani — Super Admin UI indikatori uchun */
export function explainOrgFeatures(org: OrgFeatureSource): FeatureExplain {
  const planDefaults = defaultFeaturesForPlan(org.plan.tier);
  const base = baseOrgFeatures(org);
  const out = {} as FeatureExplain;
  for (const key of FEATURE_KEYS) {
    const ov = org.features?.[key];
    if (typeof ov === 'boolean' && ov !== base[key]) {
      out[key] = { enabled: ov, source: 'override', base: base[key] };
    } else {
      out[key] = { enabled: base[key], source: base[key] !== planDefaults[key] ? 'preset' : 'plan', base: base[key] };
    }
  }
  return out;
}

/** To'liq qiymatlardan faqat bazadan (tarif + preset) FARQ qiladiganlarini qoldiradi */
export function diffFeatureOverrides(
  org: Pick<OrgFeatureSource, 'plan' | 'businessType'>,
  wanted: OrgFeatures,
): Partial<OrgFeatures> {
  const base = baseOrgFeatures(org);
  const out: Partial<OrgFeatures> = {};
  for (const key of FEATURE_KEYS) {
    if (wanted[key] !== base[key]) out[key] = wanted[key];
  }
  return out;
}

export function isFeatureEnabled(org: OrgFeatureSource, key: FeatureKey): boolean {
  return resolveOrgFeatures(org)[key];
}

/** IMEI rejimi — biznes turi (TERMS.hasImei) asosida */
export function isImeiEnabled(org: Pick<OrgFeatureSource, 'businessType'>): boolean {
  return isPhoneShop(org);
}
