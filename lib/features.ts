import { PlanTier } from './plans';
import { isPhoneShop } from './businessTypes';
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
    label: 'Variant',
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

export function defaultFeaturesForPlan(tier: string): OrgFeatures {
  const plan = (['free', 'starter', 'pro', 'business', 'custom'].includes(tier) ? tier : 'pro') as PlanTier;
  const features = {} as OrgFeatures;
  for (const key of FEATURE_KEYS) {
    features[key] = TENANT_MODULES[key].defaultByPlan[plan];
  }
  return features;
}

export function resolveOrgFeatures(org: OrgFeatureSource): OrgFeatures {
  const defaults = defaultFeaturesForPlan(org.plan.tier);
  if (!org.features) return defaults;
  const resolved = { ...defaults };
  for (const key of FEATURE_KEYS) {
    if (typeof org.features[key] === 'boolean') resolved[key] = org.features[key]!;
  }
  return resolved;
}

export function isFeatureEnabled(org: OrgFeatureSource, key: FeatureKey): boolean {
  return resolveOrgFeatures(org)[key];
}

export function isImeiEnabled(org: Pick<OrgFeatureSource, 'businessType'>): boolean {
  return isPhoneShop(org);
}
