/**
 * Xodim (filial login) HUQUQLARI — modul (feature) dan alohida qatlam.
 *   Modul  = do'konga nima OCHIQ (tarif + biznes preseti + Super Admin)
 *   Huquq  = shu do'kon ichida KIM nima qila oladi (rol standarti + do'kon egasi/Super Admin)
 *
 * Saqlash: tenant User.permissions?: string[]
 *   undefined → rol standarti (ROLE_DEFAULT_PERMISSIONS)
 *   massiv    → aynan shu ro'yxat (admin bergan/olgan)
 * Admin (do'kon egasi) — doim BARCHA huquqqa ega (o'zini bloklab qo'ymasligi uchun).
 *
 * Bu fayl client'da ham ishlaydi (DB importi yo'q).
 */
import type { FeatureKey } from './featureKeys';

export const PERMISSION_KEYS = [
  'sale.create',
  'sale.cancel',
  'sale.discount',
  'sale.editPrice',
  'payment.accept',
  'product.create',
  'product.edit',
  'product.delete',
  'product.viewCost',
  'transfer.create',
  'kassa.view',
  'kirimChiqim.manage',
  'reports.view',
  'customers.manage',
  'export.data',
  'audit.view',
  'daftar.manage',
  'users.manage',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type PermissionGroup = 'savdo' | 'ombor' | 'moliya' | 'boshqaruv';

export interface PermissionDef {
  key: PermissionKey;
  label: string;
  description: string;
  group: PermissionGroup;
  /** Shu huquq bilan bog'liq modul — modul o'chiq bo'lsa huquq ham amalda ishlamaydi */
  feature?: FeatureKey;
  /** Faqat do'kon egasi (admin) — filial loginga berib bo'lmaydi */
  adminOnly?: boolean;
}

export const PERMISSIONS: Record<PermissionKey, PermissionDef> = {
  'sale.create': { key: 'sale.create', label: 'Sotuv qilish', description: 'Yangi sotuv va tez sotuv', group: 'savdo', feature: 'sales' },
  'sale.cancel': { key: 'sale.cancel', label: 'Sotuvni bekor qilish', description: 'Sotuvni bekor qilib, mahsulotni omborga qaytarish', group: 'savdo', feature: 'sales' },
  'sale.discount': { key: 'sale.discount', label: 'Chegirma berish', description: 'Sotuv narxidan arzonroq sotish', group: 'savdo', feature: 'sales' },
  'sale.editPrice': { key: 'sale.editPrice', label: 'Sotuvda narxni o\'zgartirish', description: 'Tez sotuvda narxni qo\'lda kiritish', group: 'savdo', feature: 'sales' },
  'payment.accept': { key: 'payment.accept', label: 'To\'lov qabul qilish', description: 'Qarz/nasiya bo\'yicha to\'lov qo\'shish', group: 'savdo', feature: 'sales' },
  'product.create': { key: 'product.create', label: 'Mahsulot qo\'shish', description: 'Omborga yangi mahsulot va CSV import', group: 'ombor', feature: 'products' },
  'product.edit': { key: 'product.edit', label: 'Mahsulotni tahrirlash', description: 'Nom, narx, son va holatni o\'zgartirish', group: 'ombor', feature: 'products' },
  'product.delete': { key: 'product.delete', label: 'Mahsulotni o\'chirish', description: 'Ombordan butunlay o\'chirish', group: 'ombor', feature: 'products' },
  'product.viewCost': { key: 'product.viewCost', label: 'Kelish narxini ko\'rish', description: 'Kelish narxi va foyda (ro\'yxat, batafsil, CSV)', group: 'ombor', feature: 'products' },
  'transfer.create': { key: 'transfer.create', label: 'Filialga berish', description: 'Mahsulotni boshqa filialga o\'tkazish', group: 'ombor', feature: 'products' },
  'kassa.view': { key: 'kassa.view', label: 'Kassani ko\'rish', description: 'Naqd kassa va kunlik tushum', group: 'moliya', feature: 'kassa' },
  // Kirim-chiqim — barcha filiallar bo'yicha umumiy moliya, shuning uchun faqat egasi
  'kirimChiqim.manage': { key: 'kirimChiqim.manage', label: 'Kirim-chiqim', description: 'Kirim/chiqim jurnalini ko\'rish va yozish (barcha filiallar)', group: 'moliya', feature: 'kirimChiqim', adminOnly: true },
  'reports.view': { key: 'reports.view', label: 'Hisobotni ko\'rish', description: 'Foyda va sotuv statistikasi', group: 'moliya', feature: 'monitoring' },
  'customers.manage': { key: 'customers.manage', label: 'Mijozlar', description: 'Mijoz qo\'shish va tahrirlash', group: 'savdo' },
  'export.data': { key: 'export.data', label: 'Eksport (CSV)', description: 'Ombor va sotuvlarni faylga yuklab olish', group: 'boshqaruv', feature: 'export' },
  'audit.view': { key: 'audit.view', label: 'Amallar tarixi', description: 'Xodimlar amallari jurnali', group: 'boshqaruv', feature: 'audit', adminOnly: true },
  'daftar.manage': { key: 'daftar.manage', label: 'Daftar', description: 'Shaxsiy qarz daftari yozuvlari', group: 'moliya', feature: 'daftar' },
  'users.manage': { key: 'users.manage', label: 'Filial va loginlar', description: 'Filial ochish, parol, huquqlarni boshqarish', group: 'boshqaruv', feature: 'users', adminOnly: true },
};

export const PERMISSION_GROUP_LABELS: Record<PermissionGroup, string> = {
  savdo: 'Savdo',
  ombor: 'Ombor',
  moliya: 'Moliya',
  boshqaruv: 'Boshqaruv',
};

export type TenantRole = 'admin' | 'user';

/** Rol standartlari. admin — hammasi; user (filial login) — kundalik ish uchun yetarli to'plam */
export const ROLE_DEFAULT_PERMISSIONS: Record<TenantRole, readonly PermissionKey[]> = {
  admin: PERMISSION_KEYS,
  user: [
    'sale.create',
    'sale.discount',
    'sale.editPrice',
    'payment.accept',
    'product.create',
    'product.edit',
    'product.viewCost',
    'transfer.create',
    'kassa.view',
    'reports.view',
    'customers.manage',
    'daftar.manage',
  ],
};

export function isPermissionKey(v: unknown): v is PermissionKey {
  return typeof v === 'string' && (PERMISSION_KEYS as readonly string[]).includes(v);
}

export interface PermissionSubject {
  role: string;
  permissions?: readonly string[] | null;
}

/** Foydalanuvchining amaldagi huquqlari (to'plam) */
export function effectivePermissions(user: PermissionSubject): Set<PermissionKey> {
  if (user.role === 'admin') return new Set(PERMISSION_KEYS);
  if (user.role !== 'user') return new Set();
  const list = Array.isArray(user.permissions) ? user.permissions : ROLE_DEFAULT_PERMISSIONS.user;
  // adminOnly huquqlar filial loginga hech qachon berilmaydi (bazada bo'lsa ham)
  return new Set(list.filter((k): k is PermissionKey => isPermissionKey(k) && !PERMISSIONS[k].adminOnly));
}

export function hasPermission(user: PermissionSubject | null | undefined, key: PermissionKey): boolean {
  if (!user) return false;
  return effectivePermissions(user).has(key);
}

/**
 * Formadan/so'rovdan kelgan ro'yxatni tozalaydi: faqat ma'lum, filialga beriladigan kalitlar.
 * Natija rol standartiga teng bo'lsa — undefined (standartga qaytadi, keyingi standart o'zgarishlariga ergashadi).
 */
export function normalizeUserPermissions(input: readonly unknown[]): PermissionKey[] | undefined {
  const set = new Set(input.filter((k): k is PermissionKey => isPermissionKey(k) && !PERMISSIONS[k].adminOnly));
  const list = PERMISSION_KEYS.filter((k) => set.has(k));
  const defaults = ROLE_DEFAULT_PERMISSIONS.user;
  if (list.length === defaults.length && defaults.every((k) => set.has(k))) return undefined;
  return list;
}

export const PERMISSION_DENIED_MESSAGE = 'Bu amal uchun huquqingiz yo\'q. Do\'kon egasiga murojaat qiling.';

export function permissionDeniedError(key: PermissionKey): { error: string } {
  return { error: `«${PERMISSIONS[key].label}» huquqi yo'q. Do'kon egasiga murojaat qiling.` };
}
