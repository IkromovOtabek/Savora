/** Modul kalitlari — server/client va Mongoose schema uchun (features.ts dan ajratilgan) */
export const FEATURE_KEYS = [
  'sales',
  'kassa',
  'variant',
  'creditKassa',
  'kirimChiqim',
  'monitoring',
  'products',
  'inventory',
  'users',
  'export',
  'mediaUpload',
  'transferred',
  'audit',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type OrgFeatures = Record<FeatureKey, boolean>;

export type OrgFeatureSource = {
  plan: { tier: string; maxFilial: number; maxUsers: number };
  features?: Partial<OrgFeatures>;
  businessType?: string;
};

export const TENANT_COLLECTIONS = ['users', 'branches', 'products', 'customers', 'sales', 'credit_banks', 'cash_flows'] as const;
