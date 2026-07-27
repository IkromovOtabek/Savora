import type { IconName } from '@/components/icons/Icon';

export type BusinessType =
  | 'general'
  | 'phone_shop'
  | 'restaurant'
  | 'wholesale'
  | 'service'
  | 'pharmacy'
  | 'auto_parts';

export const BUSINESS_TYPES: Record<BusinessType, { label: string; description: string; icon: IconName }> = {
  general: { label: 'Umumiy savdo', description: "Har qanday do'kon", icon: 'store' },
  phone_shop: { label: "Telefon do'kon", description: 'IMEI va bulk qidiruv', icon: 'phone' },
  restaurant: { label: 'Restoran / kafe', description: 'Ovqat va xizmat savdosi', icon: 'utensils' },
  wholesale: { label: 'Optom savdo', description: 'Katta hajmli savdo', icon: 'box' },
  service: { label: 'Xizmat markazi', description: 'Salon, ustaxona va xizmatlar', icon: 'wrench' },
  pharmacy: { label: 'Dorixona', description: 'Dori-darmon savdosi', icon: 'pill' },
  auto_parts: { label: 'Avto ehtiyot qism', description: 'Avtomobil qismlari', icon: 'car' },
};

const VALID: BusinessType[] = ['general', 'phone_shop', 'restaurant', 'wholesale', 'service', 'pharmacy', 'auto_parts'];

export function parseBusinessType(v: string): BusinessType {
  return VALID.includes(v as BusinessType) ? (v as BusinessType) : 'general';
}

export function isPhoneShop(org: { businessType?: string }): boolean {
  return org.businessType === 'phone_shop';
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
  restaurant: { item: 'Taom', items: 'Menyu', addItem: 'Taom qo\'shish', codeLabel: 'Kod', hasImei: false },
  wholesale: { item: 'Mahsulot', items: 'Ombor', addItem: 'Mahsulot qo\'shish', codeLabel: 'Kod / shtrix', hasImei: false },
  service: { item: 'Xizmat', items: 'Xizmatlar', addItem: 'Xizmat qo\'shish', codeLabel: 'Kod', hasImei: false },
  pharmacy: { item: 'Dori', items: 'Dorixona', addItem: 'Dori qo\'shish', codeLabel: 'Shtrix', hasImei: false },
  auto_parts: { item: 'Ehtiyot qism', items: 'Ombor', addItem: 'Qism qo\'shish', codeLabel: 'Kod / shtrix', hasImei: false },
};

export function termsFor(businessType?: string): Terms {
  return TERMS[parseBusinessType(businessType || 'general')];
}
