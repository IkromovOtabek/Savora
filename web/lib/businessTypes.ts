import type { IconName } from '@/components/icons/Icon';

/**
 * Biznes yo'nalishlari. YAGONA MANBA: BUSINESS_TYPE_IDS — Mongoose enum, validatsiya,
 * ro'yxatdan o'tish formasi va super admin shu ro'yxatdan oladi.
 * Eski id'lar o'zgarmaydi (bazada saqlangan), yangilari faqat QO'SHILADI.
 */
export const BUSINESS_TYPE_IDS = [
  'general',
  'phone_shop',
  'electronics',
  'furniture',
  'clothing',
  'grocery',
  'building',
  'cosmetics',
  'pharmacy',
  'auto_parts',
  'wholesale',
  'restaurant',
  'service',
  // Ishlab chiqarish sexi (docs/SEX_API.md); kichik yo'nalish — Organization.industryProfile
  'manufacturing',
] as const;

export type BusinessType = (typeof BUSINESS_TYPE_IDS)[number];

export const BUSINESS_TYPES: Record<BusinessType, { label: string; description: string; icon: IconName }> = {
  general: { label: 'Umumiy savdo', description: "Har qanday do'kon", icon: 'store' },
  phone_shop: { label: "Telefon do'kon", description: 'IMEI, nasiya va bank krediti', icon: 'phone' },
  electronics: { label: 'Maishiy texnika', description: 'Texnika, nasiya va bank krediti', icon: 'tv' },
  furniture: { label: 'Mebel', description: "Mebel, buyurtma va bo'lib to'lash", icon: 'sofa' },
  clothing: { label: 'Kiyim-kechak', description: "Kiyim, poyabzal, o'lcham va rang", icon: 'shirt' },
  grocery: { label: 'Oziq-ovqat / minimarket', description: 'Tez sotuv va qarz daftari', icon: 'basket' },
  building: { label: 'Qurilish mollari', description: 'Optom-chakana, qarz daftari', icon: 'hammer' },
  cosmetics: { label: 'Kosmetika / parfyumeriya', description: 'Kosmetika, atir va rasmli katalog', icon: 'sparkles' },
  pharmacy: { label: 'Dorixona', description: 'Dori-darmon savdosi', icon: 'pill' },
  auto_parts: { label: 'Avto ehtiyot qism', description: 'Avtomobil qismlari', icon: 'car' },
  wholesale: { label: 'Optom savdo / distribyutor', description: 'Katta hajmli savdo, kirim akti va xaridlar', icon: 'box' },
  restaurant: { label: 'Restoran / kafe', description: 'Ovqat va xizmat savdosi', icon: 'utensils' },
  service: { label: 'Xizmat markazi', description: 'Salon, ustaxona va xizmatlar', icon: 'wrench' },
  manufacturing: { label: 'Ishlab chiqarish sexi', description: 'Texkarta, xom ashyo, tannarx va ishbay haq', icon: 'building' },
};

export function isBusinessType(v: unknown): v is BusinessType {
  return typeof v === 'string' && (BUSINESS_TYPE_IDS as readonly string[]).includes(v);
}

export function parseBusinessType(v: string): BusinessType {
  return isBusinessType(v) ? v : 'general';
}

/** Biznes turiga qarab atamalar — UI/mobil yorliqlari shu asosda o'zgaradi. */
export interface Terms {
  item: string; // birlik: "Mahsulot" / "Taom" / "Dori" / "Xizmat"
  items: string; // Ombor bo'limi nomi: "Ombor" / "Menyu" / "Dorixona"
  addItem: string; // "Mahsulot qo'shish" ...
  codeLabel: string; // asosiy kod maydoni: "IMEI" / "Kod" / "Barcode"
  hasImei: boolean; // IMEI majburiymi (telefon do'kon)
}

export const TERMS: Record<BusinessType, Terms> = {
  general: { item: 'Mahsulot', items: 'Ombor', addItem: 'Mahsulot qo\'shish', codeLabel: 'Kod / shtrix', hasImei: false },
  phone_shop: { item: 'Telefon', items: 'Ombor', addItem: 'Telefon qo\'shish', codeLabel: 'IMEI', hasImei: true },
  electronics: { item: 'Texnika', items: 'Ombor', addItem: 'Texnika qo\'shish', codeLabel: 'Seriya / shtrix', hasImei: false },
  furniture: { item: 'Mebel', items: 'Ombor', addItem: 'Mebel qo\'shish', codeLabel: 'Artikul', hasImei: false },
  clothing: { item: 'Kiyim', items: 'Ombor', addItem: 'Kiyim qo\'shish', codeLabel: 'Artikul / shtrix', hasImei: false },
  grocery: { item: 'Mahsulot', items: 'Ombor', addItem: 'Mahsulot qo\'shish', codeLabel: 'Shtrix', hasImei: false },
  building: { item: 'Material', items: 'Ombor', addItem: 'Material qo\'shish', codeLabel: 'Kod / shtrix', hasImei: false },
  cosmetics: { item: 'Mahsulot', items: 'Ombor', addItem: 'Mahsulot qo\'shish', codeLabel: 'Shtrix', hasImei: false },
  pharmacy: { item: 'Dori', items: 'Dorixona', addItem: 'Dori qo\'shish', codeLabel: 'Shtrix', hasImei: false },
  auto_parts: { item: 'Ehtiyot qism', items: 'Ombor', addItem: 'Qism qo\'shish', codeLabel: 'Kod / shtrix', hasImei: false },
  wholesale: { item: 'Mahsulot', items: 'Ombor', addItem: 'Mahsulot qo\'shish', codeLabel: 'Kod / shtrix', hasImei: false },
  restaurant: { item: 'Taom', items: 'Menyu', addItem: 'Taom qo\'shish', codeLabel: 'Kod', hasImei: false },
  service: { item: 'Xizmat', items: 'Xizmatlar', addItem: 'Xizmat qo\'shish', codeLabel: 'Kod', hasImei: false },
  manufacturing: { item: 'Mahsulot', items: 'Ombor', addItem: 'Mahsulot qo\'shish', codeLabel: 'Artikul / kod', hasImei: false },
};

/**
 * Mahsulot formasining yo'nalishga xos maydonlari. YAGONA MANBA: web ProductForm,
 * mobil product-new (/api/mobile/me → productFields) va server validatsiyasi
 * (lib/productFields.ts) shu ro'yxatdan oladi. Yorliqlar lug'atda: web d.stock.fields,
 * mobil d.productFields. IMEI alohida — TERMS.hasImei.
 */
export const PRODUCT_FIELD_KEYS = [
  'category',
  'unit',
  'size',
  'color',
  'warrantyMonths',
  'batchNumber',
  'expiryDate',
  'oemCode',
] as const;
export type ProductFieldKey = (typeof PRODUCT_FIELD_KEYS)[number];

/**
 * O'lchov birligi. Kasrli birliklar (kg, m, list…) — lib/qty.ts → FRACTIONAL_UNITS.
 * Yangilari faqat OXIRIGA qo'shiladi (bazada saqlangan). list — list (LDSP/DVP), rulon — rulon (mato, plyonka),
 * m3 — kub metr, t — tonna, juft — juft (poyabzal, qo'lqop).
 */
export const PRODUCT_UNITS = ['dona', 'kg', 'g', 'm', 'm2', 'l', 'qop', 'quti', 'paket', 'list', 'rulon', 'm3', 't', 'juft'] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export interface ProductFieldSpec {
  key: ProductFieldKey;
  required?: boolean;
}

const CATEGORY: ProductFieldSpec = { key: 'category' };
const UNIT: ProductFieldSpec = { key: 'unit' };
const WARRANTY: ProductFieldSpec = { key: 'warrantyMonths' };
const EXPIRY: ProductFieldSpec = { key: 'expiryDate' };

export const PRODUCT_FIELDS: Record<BusinessType, ProductFieldSpec[]> = {
  general: [CATEGORY],
  phone_shop: [CATEGORY, WARRANTY],
  electronics: [CATEGORY, WARRANTY],
  furniture: [CATEGORY, WARRANTY],
  clothing: [CATEGORY, { key: 'size' }, { key: 'color' }],
  grocery: [CATEGORY, UNIT, EXPIRY],
  building: [CATEGORY, UNIT],
  cosmetics: [CATEGORY, EXPIRY],
  pharmacy: [CATEGORY, { key: 'batchNumber' }, { key: 'expiryDate', required: true }],
  auto_parts: [CATEGORY, { key: 'oemCode' }],
  wholesale: [CATEGORY, UNIT],
  restaurant: [CATEGORY],
  service: [CATEGORY],
  manufacturing: [CATEGORY, UNIT],
};

export function productFieldsFor(businessType?: string, extra?: readonly string[] | null): ProductFieldSpec[] {
  const base = PRODUCT_FIELDS[parseBusinessType(businessType || 'general')];
  if (!extra?.length) return base;
  const have = new Set<string>(base.map((s) => s.key));
  const add = PRODUCT_FIELD_KEYS.filter((k) => extra.includes(k) && !have.has(k)).map((key) => ({ key }));
  return add.length ? [...base, ...add] : base;
}

/**
 * Do'konga xos mahsulot maydonlari: yo'nalish (PRODUCT_FIELDS) + ro'yxatdan o'tish ustasi qo'shganlari
 * (Organization.productFieldsExtra — hammasi ixtiyoriy). §4.3 maydonlari (general: unit; furniture: size, color;
 * cosmetics: batchNumber; auto_parts: warrantyMonths, unit; xizmat: oemCode / warrantyMonths) PRODUCT_FIELDS ga
 * qo'shilmaydi — mavjud do'konlar formasi o'zgarmasin; ular javob bo'yicha (lib/onboardingQuestions.ts → planOnboarding)
 * faqat yangi do'konga yoziladi. Mavjud do'konlarda extra yo'q → natija PRODUCT_FIELDS bilan bir xil.
 */
export function orgProductFields(org: { businessType?: string; productFieldsExtra?: readonly string[] | null }): ProductFieldSpec[] {
  return productFieldsFor(org.businessType, org.productFieldsExtra);
}

/** Do'kon tavsiya birliklari (Organization.preferredUnits) birinchi, qolganlari odatdagi tartibda */
export function orderedUnits(preferred?: readonly string[] | null): ProductUnit[] {
  const first = PRODUCT_UNITS.filter((u) => preferred?.includes(u));
  return [...first, ...PRODUCT_UNITS.filter((u) => !first.includes(u))];
}

export function termsFor(businessType?: string): Terms {
  return TERMS[parseBusinessType(businessType || 'general')];
}

/**
 * Ishlab chiqarish sexining kichik yo'nalishi (Organization.industryProfile) — faqat `manufacturing` turida.
 * Ro'yxatni og'irlashtirmaslik uchun biznes turi emas, alohida maydon. Nomlari: d.catalog.industryProfiles.
 */
export const INDUSTRY_PROFILES = ['furniture_shop', 'sewing', 'bakery', 'meat', 'plastics_building', 'other_production'] as const;
export type IndustryProfile = (typeof INDUSTRY_PROFILES)[number];

export function isIndustryProfile(v: unknown): v is IndustryProfile {
  return typeof v === 'string' && (INDUSTRY_PROFILES as readonly string[]).includes(v);
}

/**
 * Formadan kelgan profil: faqat `manufacturing` turida saqlanadi (boshqa turda — null, ya'ni tozalanadi).
 * Bo'sh yoki noma'lum qiymat — null.
 */
export function parseIndustryProfile(v: unknown, businessType: string): IndustryProfile | null {
  if (businessType !== 'manufacturing') return null;
  return isIndustryProfile(v) ? v : null;
}

/** Profil bo'yicha tavsiya qilinadigan birliklar (mahsulot formasida birinchi ko'rsatiladi) */
export const INDUSTRY_PROFILE_UNITS: Record<IndustryProfile, readonly ProductUnit[]> = {
  furniture_shop: ['list', 'm2', 'm', 'dona'],
  sewing: ['m', 'rulon', 'dona', 'kg'],
  bakery: ['kg', 'l', 'dona'],
  meat: ['kg', 'dona'],
  plastics_building: ['kg', 't', 'm3', 'dona'],
  other_production: ['dona', 'kg', 'm', 'l'],
};

/** IMEI rejimi (telefon do'kon) — TERMS.hasImei asosida */
export function isPhoneShop(org: { businessType?: string }): boolean {
  return termsFor(org.businessType).hasImei;
}
