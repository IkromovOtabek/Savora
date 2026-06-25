export type PlanTier = 'free' | 'starter' | 'pro' | 'business' | 'custom';

export interface PlanPreset {
  tier: PlanTier;
  label: string;
  description: string;
  maxFilial: number;
  maxUsers: number;
  maxProducts: number;
  monthlyPrice: number;
  yearlyPrice: number;
  marketingFeatures: string[];
  isFree?: boolean;
}

export const DEFAULT_PLAN_PRESETS: Record<Exclude<PlanTier, 'custom'>, PlanPreset> = {
  free: {
    tier: 'free',
    label: 'Bepul',
    description: 'Hamisha bepul — cheklovlar bilan',
    maxFilial: 1,
    maxUsers: 2,
    maxProducts: 50,
    monthlyPrice: 0,
    yearlyPrice: 0,
    isFree: true,
    marketingFeatures: ['1 filial', '2 xodim', '50 mahsulot', 'Ombor + Sotuv', 'Kassa'],
  },
  starter: {
    tier: 'starter',
    label: "Boshlang'ich",
    description: "Kichik do'konlar uchun",
    maxFilial: 1,
    maxUsers: 3,
    maxProducts: 500,
    monthlyPrice: 99_000,
    yearlyPrice: 79_000,
    marketingFeatures: ['1 filial', '3 xodim', '500 mahsulot', 'Ombor + Sotuv', 'Kassa', 'Mijozlar'],
  },
  pro: {
    tier: 'pro',
    label: 'Pro',
    description: "O'sayotgan biznes uchun",
    maxFilial: 5,
    maxUsers: 15,
    maxProducts: 5000,
    monthlyPrice: 249_000,
    yearlyPrice: 199_000,
    marketingFeatures: ['5 filial', '15 xodim', '5000 mahsulot', 'Barcha modullar', 'Hisobot', 'CSV export'],
  },
  business: {
    tier: 'business',
    label: 'Biznes',
    description: "Tarmoq do'konlar uchun",
    maxFilial: 999,
    maxUsers: 999,
    maxProducts: 999_999,
    monthlyPrice: 499_000,
    yearlyPrice: 399_000,
    marketingFeatures: ['Cheksiz filial', 'Cheksiz xodim', 'Cheksiz mahsulot', 'Barcha imkoniyatlar', 'Shaxsiy yordam'],
  },
};

export const CUSTOM_PLAN_PRESET: PlanPreset = {
  tier: 'custom',
  label: 'Kelishuv',
  description: "Qo'lda kelishilgan shartlar",
  maxFilial: 1,
  maxUsers: 3,
  maxProducts: 500,
  monthlyPrice: 0,
  yearlyPrice: 0,
  marketingFeatures: ['Individual shartlar', 'Maxsus modullar', 'Kelishuv asosida to\'lov'],
};

export const PLAN_PRESETS: Record<PlanTier, PlanPreset> = {
  ...DEFAULT_PLAN_PRESETS,
  custom: CUSTOM_PLAN_PRESET,
};

export function getPlanPreset(tier: string): PlanPreset {
  if (tier === 'custom') return CUSTOM_PLAN_PRESET;
  return DEFAULT_PLAN_PRESETS[tier as Exclude<PlanTier, 'custom'>] ?? DEFAULT_PLAN_PRESETS.pro;
}

export function parsePlanTier(v: string): PlanTier {
  if (v === 'free' || v === 'starter' || v === 'pro' || v === 'business' || v === 'custom') return v;
  return 'pro';
}

export function fmtPlanPrice(n: number): string {
  if (n === 0) return 'Bepul';
  return new Intl.NumberFormat('uz-UZ').format(n) + ' so\'m';
}

export function yearlyDiscount(preset: PlanPreset): number {
  if (!preset.monthlyPrice) return 0;
  return Math.round(((preset.monthlyPrice - preset.yearlyPrice) / preset.monthlyPrice) * 100);
}

export interface OrgPlanSource {
  tier: string;
  maxFilial: number;
  maxUsers: number;
  maxProducts?: number;
  monthlyPayment?: number;
  agreementNote?: string;
}

export function resolveOrgPlan(org: { plan: OrgPlanSource }): PlanPreset & { monthlyPayment: number; agreementNote?: string } {
  const preset = getPlanPreset(org.plan.tier);
  return {
    ...preset,
    tier: parsePlanTier(org.plan.tier),
    maxFilial: org.plan.maxFilial ?? preset.maxFilial,
    maxUsers: org.plan.maxUsers ?? preset.maxUsers,
    maxProducts: org.plan.maxProducts ?? preset.maxProducts,
    monthlyPayment: org.plan.monthlyPayment ?? preset.monthlyPrice,
    agreementNote: org.plan.agreementNote,
  };
}

/** Limit yetganini tekshirish */
export interface PlanLimits {
  usersAtLimit: boolean;
  branchesAtLimit: boolean;
  productsAtLimit: boolean;
  usersPercent: number;
  branchesPercent: number;
  productsPercent: number;
}

export function checkPlanLimits(
  plan: Pick<PlanPreset, 'maxFilial' | 'maxUsers' | 'maxProducts'>,
  current: { users: number; branches: number; products: number }
): PlanLimits {
  const maxProducts = plan.maxProducts ?? 999_999;
  return {
    usersAtLimit: current.users >= plan.maxUsers,
    branchesAtLimit: current.branches >= plan.maxFilial,
    productsAtLimit: current.products >= maxProducts,
    usersPercent: Math.min(100, Math.round((current.users / plan.maxUsers) * 100)),
    branchesPercent: Math.min(100, Math.round((current.branches / plan.maxFilial) * 100)),
    productsPercent: Math.min(100, Math.round((current.products / maxProducts) * 100)),
  };
}
