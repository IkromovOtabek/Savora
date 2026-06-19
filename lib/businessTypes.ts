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
