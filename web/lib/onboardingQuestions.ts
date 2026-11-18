import { z } from 'zod';
import {
  INDUSTRY_PROFILES,
  INDUSTRY_PROFILE_UNITS,
  PRODUCT_FIELD_KEYS,
  PRODUCT_UNITS,
  parseBusinessType,
  type BusinessType,
  type IndustryProfile,
  type ProductFieldKey,
  type ProductUnit,
} from './businessTypes';
import { SIGNUP_PRESET_EXTRAS } from './businessPresets';
import { baseOrgFeatures, diffFeatureOverrides, planAllows } from './features';
import type { FeatureKey, OrgFeatures } from './featureKeys';
import type { Dict } from './i18n/dict';

/**
 * RO'YXATDAN O'TISH USTASI — savollar va «javob → sozlama» xaritasi. YAGONA MANBA (sof: DB yo'q, client'da ham ishlaydi):
 * web forma (app/register), mobil (GET /api/mobile/auth/register → questions), server validatsiya (registerAction,
 * POST /api/mobile/auth/register) va qo'llash (lib/onboardingSetup.ts) shu fayldan oladi.
 * Asos: docs/business/TAKLIF_2026-11_SHABLONLAR.md §4.3, §4.5, §2.3, §1.
 *
 * Qoidalar:
 *  - har turda 2–5 ta qisqa savol; har savolning standart javobi bor (o'tkazib yuborilsa ham ishlaydi);
 *  - matnlar faqat lug'atda: d.onboarding.questions[<tur>][<savol>] (sex profili nomlari — d.catalog.industryProfiles);
 *  - modul faqat TARIF RUXSAT BERGAN doirada yoqiladi (onboardingFeatureOverrides → planAllows); o'chirish — har doim;
 *  - savol/variant faqat QO'SHILADI (javoblar org.onboardingAnswers da saqlanadi).
 */

export const ONBOARDING_VERSION = 1;

export type AnswerValue = string | number | boolean;
export type OnboardingAnswers = Record<string, AnswerValue>;

/** Savol faqat boshqa javob shu qiymatlardan biri bo'lsa ko'rinadi (va qo'llanadi) */
export interface ShowIf {
  q: string;
  is: readonly AnswerValue[];
}

interface BaseQ {
  key: string;
  showIf?: ShowIf;
}
export type OnboardingQuestion =
  | (BaseQ & { kind: 'yesno'; default: boolean })
  | (BaseQ & { kind: 'choice'; options: readonly string[]; default: string })
  | (BaseQ & { kind: 'number'; default: number; min: number; max: number; step: number; suffix: 'percent' | 'sum' | 'days' });

/** Tayyor kategoriyalar (nomlari: d.onboarding.categories) */
export const SETUP_CATEGORY_KEYS = [
  'phonesNew', 'phonesUsed', 'accessories', 'clothes', 'shoes', 'cement', 'rebar', 'paint', 'plumbing', 'electrical',
  'medicines', 'medicalSupplies', 'vitamins', 'hygiene',
] as const;
export type SetupCategoryKey = (typeof SETUP_CATEGORY_KEYS)[number];

/** Chek pastidagi matn (d.onboarding.receipt) — faqat chek matni bo'sh bo'lsa yoziladi */
export const RECEIPT_NOTE_KEYS = ['warranty', 'exchange10'] as const;
export type ReceiptNoteKey = (typeof RECEIPT_NOTE_KEYS)[number];

/** Restoran: Raqobat qo'mitasi chegarasi bilan bir xil (lib/restaurant/types.ts → RESTAURANT_LIMITS.maxServiceChargePct) */
const MAX_SERVICE_CHARGE_PCT = 30;
const MAX_PACK_FEE = 1_000_000;

const yes = (key: string, def: boolean, showIf?: ShowIf): OnboardingQuestion => ({ key, kind: 'yesno', default: def, ...(showIf ? { showIf } : {}) });
const expiryDays = (def: number): OnboardingQuestion => ({ key: 'expiryDays', kind: 'number', default: def, min: 1, max: 365, step: 1, suffix: 'days' });

export const ONBOARDING_QUESTIONS: Record<BusinessType, readonly OnboardingQuestion[]> = {
  general: [yes('debt', true), yes('weighed', true), yes('stockCount', true)],
  phone_shop: [yes('nasiya', true), yes('bankCredit', true), yes('used', true)],
  electronics: [yes('nasiya', true), yes('bankCredit', true), yes('warranty', true)],
  furniture: [yes('nasiya', true), yes('variants', true), yes('warranty', true)],
  clothing: [
    { key: 'kind', kind: 'choice', options: ['clothes', 'shoes', 'both'], default: 'both' },
    yes('exchange', true),
    yes('photos', true),
  ],
  grocery: [yes('scale', true), yes('debt', true), expiryDays(7)],
  building: [yes('categories', true), yes('debt', true)],
  cosmetics: [yes('batch', true), expiryDays(30), yes('photos', true)],
  pharmacy: [expiryDays(90), yes('categories', true)],
  auto_parts: [yes('oils', true), yes('warranty', true), yes('debt', true)],
  wholesale: [yes('debt', true), yes('purchasing', true)],
  restaurant: [
    { key: 'service', kind: 'choice', options: ['waiter', 'self'], default: 'waiter' },
    yes('bar', false),
    yes('takeaway', true),
    { key: 'packFee', kind: 'number', default: 0, min: 0, max: MAX_PACK_FEE, step: 500, suffix: 'sum', showIf: { q: 'takeaway', is: [true] } },
    // 0 — xizmat haqi olinmaydi. Foiz oldindan e'lon qilinadi (menyu, chek); o'zi xizmatda doim 0 (Raqobat qo'mitasi, 21.11.2025)
    { key: 'serviceCharge', kind: 'number', default: 0, min: 0, max: MAX_SERVICE_CHARGE_PCT, step: 1, suffix: 'percent', showIf: { q: 'service', is: ['waiter'] } },
  ],
  service: [
    { key: 'kind', kind: 'choice', options: ['salon', 'auto', 'repair', 'other'], default: 'other' },
    yes('materials', false, { q: 'kind', is: ['salon', 'other'] }),
    yes('debt', false),
  ],
  // §2.3 — sex uchun 5 ta savol
  manufacturing: [
    { key: 'profile', kind: 'choice', options: INDUSTRY_PROFILES, default: 'other_production' },
    { key: 'mode', kind: 'choice', options: ['order', 'stock', 'both'], default: 'both' },
    { key: 'pay', kind: 'choice', options: ['salary', 'piece', 'mixed'], default: 'mixed' },
    { key: 'sales', kind: 'choice', options: ['shop', 'dealers', 'customers', 'mixed'], default: 'dealers' },
    yes('warehouses', true),
  ],
};

export function questionsFor(businessType?: string | null): readonly OnboardingQuestion[] {
  return ONBOARDING_QUESTIONS[parseBusinessType(businessType || 'general')];
}

/** Standart javoblar (hech narsa tanlanmasa) */
export function defaultAnswers(businessType?: string | null): OnboardingAnswers {
  return Object.fromEntries(questionsFor(businessType).map((q) => [q.key, q.default]));
}

/** Savol ko'rinadimi (showIf sharti joriy javoblarda bajariladimi) */
export function isQuestionVisible(q: { showIf?: ShowIf | null }, answers: OnboardingAnswers): boolean {
  if (!q.showIf) return true;
  return q.showIf.is.includes(answers[q.showIf.q]);
}

/** Berilgan (qisman) javoblar + standartlar → to'liq javoblar; yashirin savollar standartga qaytadi */
export function completeAnswers(businessType: string | null | undefined, given?: OnboardingAnswers | null): OnboardingAnswers {
  const qs = questionsFor(businessType);
  const out: OnboardingAnswers = { ...defaultAnswers(businessType) };
  for (const q of qs) if (given && given[q.key] !== undefined) out[q.key] = given[q.key];
  for (const q of qs) if (!isQuestionVisible(q, out)) out[q.key] = q.default;
  return out;
}

/* ───────────────────────────── validatsiya ───────────────────────────── */

function valueSchema(q: OnboardingQuestion): z.ZodType<AnswerValue> {
  if (q.kind === 'yesno') return z.boolean();
  if (q.kind === 'choice') return z.string().refine((v) => q.options.includes(v));
  return z.number().min(q.min).max(q.max);
}

/** Tur bo'yicha zod sxemasi: noma'lum kalitlar tashlanadi, har qiymat — o'z savoli bo'yicha */
export function answersSchema(businessType: BusinessType) {
  const shape: Record<string, z.ZodType<AnswerValue | undefined>> = {};
  for (const q of ONBOARDING_QUESTIONS[businessType]) shape[q.key] = valueSchema(q).optional();
  return z.object(shape);
}

export type OnboardingInput = { answers: OnboardingAnswers; sampleData: boolean };
export type OnboardingParse = ({ ok: true } & OnboardingInput) | { ok: false; key: string | null };

/**
 * Formadan / mobil JSON'dan kelgan ustaning javoblari: `{ answers?: {...}, sampleData?: boolean }`
 * (web — yashirin maydonda JSON matn). Bo'sh / yo'q — standart javoblar (ro'yxatdan o'tish buzilmaydi).
 * Noto'g'ri qiymat — `{ ok: false, key }` (qaysi savol).
 */
export function parseOnboardingInput(businessType: BusinessType, raw: unknown): OnboardingParse {
  let v: unknown = raw;
  if (typeof v === 'string') {
    if (!v.trim()) return { ok: true, answers: completeAnswers(businessType), sampleData: false };
    if (v.length > 4000) return { ok: false, key: null };
    try { v = JSON.parse(v); } catch { return { ok: false, key: null }; }
  }
  if (v === undefined || v === null) return { ok: true, answers: completeAnswers(businessType), sampleData: false };
  const top = z.object({ answers: z.record(z.string(), z.unknown()).optional(), sampleData: z.boolean().optional() }).safeParse(v);
  if (!top.success) return { ok: false, key: null };
  const parsed = answersSchema(businessType).safeParse(top.data.answers ?? {});
  if (!parsed.success) {
    const k = parsed.error.issues[0]?.path[0];
    return { ok: false, key: typeof k === 'string' ? k : null };
  }
  const clean = Object.fromEntries(Object.entries(parsed.data).filter(([, x]) => x !== undefined)) as OnboardingAnswers;
  return { ok: true, answers: completeAnswers(businessType, clean), sampleData: !!top.data.sampleData };
}

/* ───────────────────────────── javob → sozlama ───────────────────────────── */

export interface RestaurantSetup {
  /** Ofitsant xizmati (aks holda — o'zi xizmat: xizmat haqi 0) */
  waiter: boolean;
  bar: boolean;
  takeaway: boolean;
  serviceChargePct: number;
  takeawayPackFee: number;
}

/** Javoblardan chiqadigan aniq sozlamalar (qo'llash — lib/onboardingSetup.ts) */
export interface OnboardingPlan {
  /** Modul istagi (tarif cheklovi onboardingFeatureOverrides da qo'llanadi) */
  features: Partial<Record<FeatureKey, boolean>>;
  /** Mahsulot formasidagi qo'shimcha maydonlar (Organization.productFieldsExtra) */
  productFields: ProductFieldKey[];
  /** Tavsiya birliklar — formada birinchi (Organization.preferredUnits); bo'sh — barcha birliklar odatdagi tartibda */
  units: ProductUnit[];
  /** «N kunda muddati tugaydi» ogohlantirishi (ShopSettings.stock.expiryWarnDays); null — o'rnatilmaydi */
  expiryWarnDays: number | null;
  categories: SetupCategoryKey[];
  receiptNote: ReceiptNoteKey | null;
  /** Sex: «Xom ashyo ombori» (asosiy) + «Tayyor mahsulot ombori» */
  warehouses: boolean;
  industryProfile: IndustryProfile | null;
  restaurant: RestaurantSetup | null;
}

const UNITS: Record<string, ProductUnit[]> = {
  weighed: ['dona', 'kg', 'm', 'l'],
  grocery: ['kg', 'dona', 'l', 'g', 'paket'],
  building: ['dona', 'kg', 'm', 'm2', 'm3', 'qop', 't', 'l', 'list'],
  auto: ['dona', 'l', 'juft', 'm', 'kg'],
  wholesale: ['dona', 'quti', 'qop', 'kg', 'paket', 'l', 't'],
  shoes: ['dona', 'juft'],
};

const on = (v: AnswerValue | undefined) => v === true;

/** Tur + javoblar → sozlamalar (sof; berilmagan javob — standart) */
export function planOnboarding(businessType: string | null | undefined, given?: OnboardingAnswers | null): OnboardingPlan {
  const bt = parseBusinessType(businessType || 'general');
  const a = completeAnswers(bt, given);
  const p: OnboardingPlan = {
    features: {},
    productFields: [],
    units: [],
    expiryWarnDays: null,
    categories: [],
    receiptNote: null,
    warehouses: false,
    industryProfile: null,
    restaurant: null,
  };
  const f = p.features;
  const field = (k: ProductFieldKey) => { if (!p.productFields.includes(k)) p.productFields.push(k); };
  const num = (k: string) => Number(a[k]);

  switch (bt) {
    case 'general':
      f.daftar = on(a.debt);
      f.inventory = on(a.stockCount);
      if (on(a.weighed)) { field('unit'); p.units = UNITS.weighed; }
      break;
    case 'phone_shop':
    case 'electronics':
      f.nasiya = f.variant = on(a.nasiya);
      f.creditKassa = on(a.bankCredit);
      if (bt === 'phone_shop') p.categories = on(a.used) ? ['phonesNew', 'phonesUsed', 'accessories'] : ['phonesNew', 'accessories'];
      if (bt === 'electronics' && on(a.warranty)) p.receiptNote = 'warranty';
      break;
    case 'furniture':
      f.nasiya = f.variant = on(a.nasiya);
      if (on(a.variants)) { field('size'); field('color'); }
      if (on(a.warranty)) p.receiptNote = 'warranty';
      break;
    case 'clothing':
      p.categories = a.kind === 'clothes' ? ['clothes', 'accessories'] : a.kind === 'shoes' ? ['shoes', 'accessories'] : ['clothes', 'shoes', 'accessories'];
      if (a.kind !== 'clothes') p.units = UNITS.shoes;
      if (on(a.exchange)) p.receiptNote = 'exchange10';
      f.mediaUpload = on(a.photos);
      break;
    case 'grocery':
      p.units = on(a.scale) ? UNITS.grocery : ['dona', 'l', 'paket'];
      f.daftar = on(a.debt);
      p.expiryWarnDays = num('expiryDays');
      break;
    case 'building':
      if (on(a.categories)) p.categories = ['cement', 'rebar', 'paint', 'plumbing', 'electrical'];
      f.daftar = on(a.debt);
      p.units = UNITS.building;
      break;
    case 'cosmetics':
      if (on(a.batch)) field('batchNumber');
      p.expiryWarnDays = num('expiryDays');
      f.mediaUpload = on(a.photos);
      break;
    case 'pharmacy':
      p.expiryWarnDays = num('expiryDays');
      if (on(a.categories)) p.categories = ['medicines', 'medicalSupplies', 'vitamins', 'hygiene'];
      break;
    case 'auto_parts':
      if (on(a.oils)) { field('unit'); p.units = UNITS.auto; }
      if (on(a.warranty)) { field('warrantyMonths'); p.receiptNote = 'warranty'; }
      f.daftar = on(a.debt);
      break;
    case 'wholesale':
      f.daftar = on(a.debt);
      f.purchasing = on(a.purchasing);
      p.units = UNITS.wholesale;
      break;
    case 'restaurant': {
      const waiter = a.service !== 'self';
      const takeaway = on(a.takeaway);
      p.restaurant = {
        waiter,
        bar: on(a.bar),
        takeaway,
        // O'zi xizmatda xizmat haqi olinmaydi (muqobil sharti); foiz 2 xonagacha
        serviceChargePct: waiter ? Math.round(num('serviceCharge') * 100) / 100 : 0,
        takeawayPackFee: takeaway ? Math.round(num('packFee')) : 0,
      };
      break;
    }
    case 'service':
      // §4.3: «service»ni uchga bo'lish — ombor kerak bo'lgan kichik turlarda inventar yoqiladi
      if (a.kind === 'auto') { f.inventory = true; field('oemCode'); p.units = ['dona', 'l']; }
      else if (a.kind === 'repair') { f.inventory = true; field('warrantyMonths'); p.receiptNote = 'warranty'; }
      else if (on(a.materials)) f.inventory = true;
      f.daftar = on(a.debt);
      break;
    case 'manufacturing': {
      const profile = INDUSTRY_PROFILES.includes(a.profile as IndustryProfile) ? (a.profile as IndustryProfile) : 'other_production';
      p.industryProfile = profile;
      p.units = [...INDUSTRY_PROFILE_UNITS[profile]];
      // Buyurtma bo'yicha ishlab chiqarish moduli hali yo'q — «mode» javobi saqlanadi (keyin shu javob bo'yicha yoqiladi)
      if (a.pay === 'salary') f.piecework = false;
      if (a.sales === 'dealers' || a.sales === 'mixed') f.daftar = true;
      if (a.sales === 'customers' || a.sales === 'mixed') f.nasiya = f.variant = true;
      p.warehouses = on(a.warehouses);
      break;
    }
  }
  // Tartib — PRODUCT_FIELD_KEYS bo'yicha (forma barqaror ko'rinsin)
  p.productFields.sort((x, y) => PRODUCT_FIELD_KEYS.indexOf(x) - PRODUCT_FIELD_KEYS.indexOf(y));
  p.units = p.units.filter((u, i, arr) => (PRODUCT_UNITS as readonly string[]).includes(u) && arr.indexOf(u) === i);
  return p;
}

/**
 * Yangi do'kon modullari: tarif standarti + runtime preset (baseOrgFeatures) ustiga §4.3 qo'shimchalari
 * (SIGNUP_PRESET_EXTRAS) va javoblar. `true` — faqat tarif ruxsat bersa; `false` — har doim.
 * Natija — bazadan FARQ qiladigan kalitlar (org.features ga yoziladi; mavjud do'konlar runtime presetiga tegilmaydi).
 */
export function onboardingFeatureOverrides(input: {
  tier: string;
  businessType: string | null | undefined;
  plan?: Pick<OnboardingPlan, 'features'> | null;
}): Partial<OrgFeatures> {
  const bt = parseBusinessType(input.businessType || 'general');
  const src = { plan: { tier: input.tier, maxFilial: 1, maxUsers: 1 }, businessType: bt };
  const wanted = baseOrgFeatures(src);
  const want: Partial<Record<FeatureKey, boolean>> = { ...SIGNUP_PRESET_EXTRAS[bt], ...(input.plan?.features ?? {}) };
  for (const [k, v] of Object.entries(want) as [FeatureKey, boolean | undefined][]) {
    if (v === false) wanted[k] = false;
    else if (v === true && planAllows(input.tier, k)) wanted[k] = true;
  }
  return diffFeatureOverrides(src, wanted);
}

/** Saqlanadigan yozuv (Organization.onboardingAnswers) */
export interface StoredOnboarding {
  v: number;
  businessType: BusinessType;
  answers: OnboardingAnswers;
  sampleData: boolean;
  at: Date;
}

/** Saqlangan javoblar shu turga tegishli bo'lsa — javoblar, aks holda null (tur keyin o'zgargan) */
export function storedAnswersFor(stored: { businessType?: string; answers?: OnboardingAnswers } | null | undefined, businessType: string | null | undefined): OnboardingAnswers | null {
  if (!stored?.answers || stored.businessType !== parseBusinessType(businessType || 'general')) return null;
  return stored.answers;
}

/* ───────────────────────────── ko'rinish (web forma, mobil API) ───────────────────────────── */

/** Joriy tildagi savol: matnlar lug'atdan, qiymatlar — konfiguratsiyadan */
export interface QuestionView {
  key: string;
  kind: OnboardingQuestion['kind'];
  label: string;
  hint: string | null;
  default: AnswerValue;
  options: { value: string; label: string }[] | null;
  min: number | null;
  max: number | null;
  step: number | null;
  /** «%», «so'm», «kun» */
  suffix: string | null;
  showIf: ShowIf | null;
}

export function questionViews(businessType: string | null | undefined, d: Dict): QuestionView[] {
  const bt = parseBusinessType(businessType || 'general');
  const texts = d.onboarding.questions[bt] as Record<string, { label: string; hint?: string; options?: Record<string, string> }>;
  return ONBOARDING_QUESTIONS[bt].map((q) => {
    const t = texts[q.key];
    const optionLabel = (v: string) =>
      bt === 'manufacturing' && q.key === 'profile' ? (d.catalog.industryProfiles[v as IndustryProfile]?.label ?? v) : (t?.options?.[v] ?? v);
    return {
      key: q.key,
      kind: q.kind,
      label: t?.label ?? q.key,
      hint: t?.hint ?? null,
      default: q.default,
      options: q.kind === 'choice' ? q.options.map((v) => ({ value: v, label: optionLabel(v) })) : null,
      min: q.kind === 'number' ? q.min : null,
      max: q.kind === 'number' ? q.max : null,
      step: q.kind === 'number' ? q.step : null,
      suffix: q.kind === 'number' ? d.onboarding.suffix[q.suffix] : null,
      showIf: q.showIf ?? null,
    };
  });
}
