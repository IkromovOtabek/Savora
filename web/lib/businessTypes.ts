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
  wholesale: { label: 'Optom savdo', description: 'Katta hajmli savdo', icon: 'box' },
  restaurant: { label: 'Restoran / kafe', description: 'Ovqat va xizmat savdosi', icon: 'utensils' },
  service: { label: 'Xizmat markazi', description: 'Salon, ustaxona va xizmatlar', icon: 'wrench' },
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
};

export function termsFor(businessType?: string): Terms {
  return TERMS[parseBusinessType(businessType || 'general')];
}

/** IMEI rejimi (telefon do'kon) — TERMS.hasImei asosida */
export function isPhoneShop(org: { businessType?: string }): boolean {
  return termsFor(org.businessType).hasImei;
}
