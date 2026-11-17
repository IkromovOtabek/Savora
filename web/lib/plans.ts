export type PlanTier = 'free' | 'starter' | 'pro' | 'business' | 'custom';

export interface PlanPreset {
  tier: PlanTier;
  label: string;
  description: string;
  maxFilial: number;
  maxUsers: number;
  maxProducts: number;
  monthlyPrice: number;
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
    monthlyPrice: 249_000,
    marketingFeatures: ['1 filial', '3 xodim', '500 mahsulot', 'Ombor + Sotuv', 'Kassa', 'Mijozlar'],
  },
  pro: {
    tier: 'pro',
    label: 'Pro',
    description: "O'sayotgan biznes uchun",
    maxFilial: 5,
    maxUsers: 15,
    maxProducts: 5000,
    monthlyPrice: 649_000,
    marketingFeatures: ['5 filial', '15 xodim', '5000 mahsulot', 'Barcha modullar', 'Hisobot', 'CSV export'],
  },
  business: {
    tier: 'business',
    label: 'Biznes',
    description: "Tarmoq do'konlar uchun",
    maxFilial: 999,
    maxUsers: 999,
    maxProducts: 999_999,
    monthlyPrice: 1_290_000,
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

/** Narx matni. `labels` — tilga mos «Bepul» va «so'm» (UI lug'atdan beradi; standart — o'zbekcha) */
export function fmtPlanPrice(n: number, labels?: { free?: string; sum?: string }): string {
  if (n === 0) return labels?.free ?? 'Bepul';
  // Deterministik (server=client) — client komponentlarda hydration mosligi uchun
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, String.fromCharCode(0xA0)) + ' ' + (labels?.sum ?? 'so\'m');
}

/**
 * Oldindan to'lov chegirmasi. YAGONA MANBA: ro'yxatdan o'tishdagi tarif kartasi, obuna to'lovi formasi va
 * to'lov so'rovi tekshiruvi shundan oladi. Super admin oylik narxni o'zgartirsa — summalar o'zi qayta hisoblanadi.
 *   12 oy va undan ko'p — «2 oy bepul» (12 oy = 10 oy narxi); 6 oy va undan ko'p — 10% chegirma.
 */
export const PREPAY_TERMS = [
  { months: 12, num: 10, den: 12 },
  { months: 6, num: 9, den: 10 },
] as const;

/** N oyga to'lov summasi: chegirma bo'lsa 10 000 so'mga pastga yaxlitlanadi */
export function prepayAmount(monthlyPrice: number, months: number): number {
  if (!(monthlyPrice > 0) || !(months > 0)) return 0;
  const full = monthlyPrice * months;
  const term = PREPAY_TERMS.find((t) => months >= t.months);
  if (!term) return full;
  return Math.floor((full * term.num) / term.den / 10_000) * 10_000;
}

/** Chegirma: tejalgan foiz va butun «bepul oylar» soni (masalan 12 oy → 2) */
export function prepaySaving(monthlyPrice: number, months: number): { pct: number; freeMonths: number } {
  const full = monthlyPrice * months;
  if (!(full > 0)) return { pct: 0, freeMonths: 0 };
  const saved = full - prepayAmount(monthlyPrice, months);
  return { pct: Math.round((saved / full) * 100), freeMonths: Math.floor(saved / monthlyPrice) };
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
