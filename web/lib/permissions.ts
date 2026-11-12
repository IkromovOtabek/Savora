/**
 * Xodim (filial login) HUQUQLARI — modul (feature) dan alohida qatlam.
 *   Modul  = do'konga nima OCHIQ (tarif + biznes preseti + Super Admin)
 *   Huquq  = shu do'kon ichida KIM nima qila oladi (rol standarti + do'kon egasi/Super Admin)
 *
 * Tuzilma: SAHIFA → amallar (PERMISSION_PAGES, PermissionDef.page) — huquqlar oynasi shu bo'yicha chiziladi.
 *
 * Saqlash: tenant User.permissions?: string[] (+ permVersion) yoki biriktirilgan Role
 *   undefined → rol standarti (ROLE_DEFAULT_PERMISSIONS)
 *   massiv    → aynan shu ro'yxat (admin bergan/olgan)
 *   permVersion < PERMISSIONS_VERSION → yangi qo'shilgan kalitlar `legacy` qoidasi bilan avtomatik qo'shiladi
 * Admin (do'kon egasi) — doim BARCHA huquqqa ega (o'zini bloklab qo'ymasligi uchun).
 *
 * Bu fayl client'da ham ishlaydi (DB importi yo'q).
 */
import type { FeatureKey } from './featureKeys';

export const PERMISSION_KEYS = [
  // Yangi sotuv (kassa oynasi, tez sotuv)
  'sale.create',
  'sale.discount',
  'sale.editPrice',
  // Sotuvlar
  'sales.view',
  'sale.cancel',
  'sale.return',
  // Naqd kassa va smenalar
  'kassa.view',
  'kassa.shift',
  // Ombor
  'products.view',
  'product.create',
  'product.edit',
  'product.delete',
  'product.viewCost',
  'catalog.manage',
  'transfer.create',
  // Inventar, qayta baholash, hisobdan chiqarish, filialga berilganlar, yetkazib beruvchilar
  'inventory.view',
  'stock.adjust',
  'stock.writeOff',
  'transferred.view',
  'suppliers.view',
  'suppliers.manage',
  'suppliers.delete',
  // Mijozlar, qarzdorlik, nasiya, daftar
  'customers.view',
  'customers.manage',
  'debts.view',
  'payment.accept',
  'nasiya.view',
  'daftar.manage',
  'daftar.delete',
  // Hisobotlar, AI, topshiriqlar, kabinet
  'reports.view',
  'export.data',
  'ai.view',
  'tasks.view',
  'tasks.manage',
  'profile.password',
  // Faqat do'kon egasi
  'kirimChiqim.manage',
  'users.manage',
  'audit.view',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/**
 * Huquqlar SAHIFALAR bo'yicha: har sahifada «ko'rish» va shu sahifadagi amallar.
 * `ownerOnly` sahifalar filial loginga berilmaydi (huquqlar oynasida qulf bilan ko'rinadi).
 */
export const PERMISSION_PAGES = [
  'pos',
  'sales',
  'kassa',
  'products',
  'inventory',
  'revaluation',
  'writeOff',
  'transferred',
  'suppliers',
  'customers',
  'debts',
  'nasiya',
  'daftar',
  'reports',
  'ai',
  'tasks',
  'profile',
  'finance',
  'creditKassa',
  'team',
  'audit',
  'imei',
  'settings',
] as const;

export type PermissionPage = (typeof PERMISSION_PAGES)[number];

export interface PermissionPageDef {
  id: PermissionPage;
  /** Sahifa manzili (ko'rsatish uchun) */
  href: string;
  feature?: FeatureKey;
  /** Faqat do'kon egasi — filial loginga berib bo'lmaydi */
  ownerOnly?: boolean;
}

export const PERMISSION_PAGE_DEFS: Record<PermissionPage, PermissionPageDef> = {
  pos: { id: 'pos', href: '/app/pos', feature: 'sales' },
  sales: { id: 'sales', href: '/app/sales', feature: 'sales' },
  kassa: { id: 'kassa', href: '/app/kassa', feature: 'kassa' },
  products: { id: 'products', href: '/app/products', feature: 'products' },
  inventory: { id: 'inventory', href: '/app/inventory', feature: 'inventory' },
  revaluation: { id: 'revaluation', href: '/app/revaluation', feature: 'products' },
  writeOff: { id: 'writeOff', href: '/app/write-off', feature: 'products' },
  transferred: { id: 'transferred', href: '/app/transferred', feature: 'transferred' },
  suppliers: { id: 'suppliers', href: '/app/suppliers', feature: 'products' },
  customers: { id: 'customers', href: '/app/customers', feature: 'sales' },
  debts: { id: 'debts', href: '/app/debts', feature: 'sales' },
  nasiya: { id: 'nasiya', href: '/app/nasiya', feature: 'nasiya' },
  daftar: { id: 'daftar', href: '/app/daftar', feature: 'daftar' },
  reports: { id: 'reports', href: '/app/reports', feature: 'monitoring' },
  ai: { id: 'ai', href: '/app/ai', feature: 'ai' },
  tasks: { id: 'tasks', href: '/app/tasks', feature: 'tasks' },
  profile: { id: 'profile', href: '/app/profile' },
  finance: { id: 'finance', href: '/app/finance', feature: 'kirimChiqim', ownerOnly: true },
  creditKassa: { id: 'creditKassa', href: '/app/kredit-kassa', feature: 'creditKassa', ownerOnly: true },
  team: { id: 'team', href: '/app/users', feature: 'users', ownerOnly: true },
  audit: { id: 'audit', href: '/app/audit', feature: 'audit', ownerOnly: true },
  imei: { id: 'imei', href: '/app/imei', ownerOnly: true },
  settings: { id: 'settings', href: '/app/settings', ownerOnly: true },
};

export interface PermissionDef {
  key: PermissionKey;
  label: string;
  description: string;
  page: PermissionPage;
  /** Shu huquq bilan bog'liq modul — modul o'chiq bo'lsa huquq ham amalda ishlamaydi */
  feature?: FeatureKey;
  /** Faqat do'kon egasi (admin) — filial loginga berib bo'lmaydi */
  adminOnly?: boolean;
  /**
   * Bu huquq 2-versiyada qo'shilgan. Eski (1-versiya) aniq ro'yxatlarda qanday tiklanadi:
   *   'open'       — ilgari hech qanday huquq so'ralmas edi → hammaga beriladi (xodim kirishni yo'qotmasin);
   *   PermissionKey — ilgari shu huquq bilan ishlardi → o'sha bo'lsa beriladi.
   */
  legacy?: 'open' | PermissionKey;
}

const P = (key: PermissionKey, page: PermissionPage, label: string, description: string, extra: Partial<PermissionDef> = {}): PermissionDef =>
  ({ key, page, label, description, ...extra });

export const PERMISSIONS: Record<PermissionKey, PermissionDef> = {
  'sale.create': P('sale.create', 'pos', 'Sotuv qilish', 'Yangi sotuv va tez sotuv', { feature: 'sales' }),
  'sale.discount': P('sale.discount', 'pos', 'Chegirma berish', 'Sotuv narxidan arzonroq sotish', { feature: 'sales' }),
  'sale.editPrice': P('sale.editPrice', 'pos', "Narxni o'zgartirish", "Sotuvda narxni qo'lda kiritish", { feature: 'sales' }),

  'sales.view': P('sales.view', 'sales', "Sotuvlarni ko'rish", "Sotuvlar ro'yxati, sotuv tafsiloti va cheklar", { feature: 'sales', legacy: 'open' }),
  'sale.cancel': P('sale.cancel', 'sales', 'Sotuvni bekor qilish', 'Sotuvni bekor qilib, mahsulotni omborga qaytarish', { feature: 'sales' }),
  'sale.return': P('sale.return', 'sales', 'Qaytarib olish', "Sotilgan mahsulotning bir qismini qaytarib olish", { feature: 'sales', legacy: 'sale.cancel' }),

  'kassa.view': P('kassa.view', 'kassa', "Kassani ko'rish", 'Naqd kassa, kunlik tushum va smenalar tarixi', { feature: 'kassa' }),
  'kassa.shift': P('kassa.shift', 'kassa', 'Smena ochish/yopish', "Smenani ochish-yopish, kassaga pul kiritish/olish", { feature: 'kassa' }),

  'products.view': P('products.view', 'products', "Omborni ko'rish", "Mahsulotlar ro'yxati va mahsulot kartochkasi", { feature: 'products', legacy: 'open' }),
  'product.create': P('product.create', 'products', "Mahsulot qo'shish", "Yangi mahsulot, shtrix-kod bo'yicha qidirish", { feature: 'products' }),
  'product.edit': P('product.edit', 'products', 'Mahsulotni tahrirlash', "Nom, narx, son va holatni o'zgartirish", { feature: 'products' }),
  'product.delete': P('product.delete', 'products', "Mahsulotni o'chirish", "Ombordan butunlay o'chirish", { feature: 'products' }),
  'product.viewCost': P('product.viewCost', 'products', "Kelish narxini ko'rish", "Kelish narxi va foyda (ro'yxat, batafsil, CSV)", { feature: 'products' }),
  'catalog.manage': P('catalog.manage', 'products', 'Kategoriya va brendlar', "Kategoriya/brend nomini o'zgartirish, ko'chirish, o'chirish", { feature: 'products', legacy: 'product.edit' }),
  'transfer.create': P('transfer.create', 'products', 'Filialga berish', "Mahsulotni boshqa filialga o'tkazish", { feature: 'products' }),

  'inventory.view': P('inventory.view', 'inventory', "Inventarni ko'rish", "Qoldiqlar bo'yicha inventar hisoboti", { feature: 'inventory', legacy: 'open' }),
  // Qayta baholash va hisobdan chiqarish — narx va zarar masalasi, standartda faqat egasi
  'stock.adjust': P('stock.adjust', 'revaluation', 'Qayta baholash', "Mahsulot narxlarini ommaviy o'zgartirish", { feature: 'products' }),
  'stock.writeOff': P('stock.writeOff', 'writeOff', 'Hisobdan chiqarish', "Yaroqsiz yoki yo'qolgan tovarni hisobdan chiqarish", { feature: 'products', legacy: 'stock.adjust' }),
  'transferred.view': P('transferred.view', 'transferred', "Berilganlarni ko'rish", "Filialga berilgan mahsulotlar ro'yxati", { feature: 'transferred', legacy: 'open' }),
  // Yetkazib beruvchilar va ularga qarz — pul masalasi, standartda faqat egasi
  'suppliers.view': P('suppliers.view', 'suppliers', "Yetkazib beruvchilarni ko'rish", "Ro'yxat, ulardan olingan tovar va qarz holati", { feature: 'products', legacy: 'suppliers.manage' }),
  'suppliers.manage': P('suppliers.manage', 'suppliers', "Qo'shish va tahrirlash", "Yetkazib beruvchi qo'shish, tovar kirimi va to'lov yozish", { feature: 'products' }),
  'suppliers.delete': P('suppliers.delete', 'suppliers', "O'chirish", "Yetkazib beruvchini yoki uning yozuvini o'chirish", { feature: 'products', legacy: 'suppliers.manage' }),

  'customers.view': P('customers.view', 'customers', "Mijozlarni ko'rish", "Mijozlar ro'yxati, mijoz kartochkasi va akt-sverka", { feature: 'sales', legacy: 'customers.manage' }),
  'customers.manage': P('customers.manage', 'customers', "Qo'shish va tahrirlash", "Yangi mijoz qo'shish va ma'lumotini o'zgartirish", { feature: 'sales' }),
  'debts.view': P('debts.view', 'debts', "Qarzdorlikni ko'rish", "Qarzdorlar ro'yxati va eslatma yuborish", { feature: 'sales', legacy: 'open' }),
  'payment.accept': P('payment.accept', 'debts', "To'lov qabul qilish", "Qarz/nasiya bo'yicha to'lov qo'shish", { feature: 'sales' }),
  'nasiya.view': P('nasiya.view', 'nasiya', "Nasiyalarni ko'rish", "Nasiya jadvali va muddati o'tganlar", { feature: 'nasiya', legacy: 'open' }),
  'daftar.manage': P('daftar.manage', 'daftar', "Ko'rish va yozish", "Qarz daftari yozuvlari va qaytarilganini belgilash", { feature: 'daftar' }),
  'daftar.delete': P('daftar.delete', 'daftar', "Yozuvni o'chirish", "Daftar yozuvini butunlay o'chirish", { feature: 'daftar', legacy: 'daftar.manage' }),

  'reports.view': P('reports.view', 'reports', "Hisobotlarni ko'rish", 'Foyda va sotuv statistikasi', { feature: 'monitoring' }),
  'export.data': P('export.data', 'reports', 'Eksport (CSV)', 'Ombor va sotuvlarni faylga yuklab olish', { feature: 'export' }),
  // AI tahlil — butun biznes ko'rsatkichlari; filialga faqat egasi bersa (standartda o'chiq)
  'ai.view': P('ai.view', 'ai', 'AI yordamchi', "AI tahlil va tavsiyalarni ko'rish, qayta tahlil qilish", { feature: 'ai' }),
  'tasks.view': P('tasks.view', 'tasks', "Topshiriqlarni ko'rish", "O'ziga va filialiga berilgan topshiriqlar, bajarilganini belgilash", { feature: 'tasks', legacy: 'open' }),
  'tasks.manage': P('tasks.manage', 'tasks', 'Topshiriqlarni boshqarish', "Topshiriq yaratish, biriktirish va o'chirish", { feature: 'tasks' }),
  'profile.password': P('profile.password', 'profile', "O'z parolini o'zgartirish", "Kabinetda o'z parolini almashtirish (birinchi kirishdagi majburiy almashtirish bundan mustasno)", { legacy: 'open' }),

  // Kirim-chiqim — barcha filiallar bo'yicha umumiy moliya, shuning uchun faqat egasi
  'kirimChiqim.manage': P('kirimChiqim.manage', 'finance', 'Kirim-chiqim', "Kirim/chiqim jurnalini ko'rish va yozish (barcha filiallar)", { feature: 'kirimChiqim', adminOnly: true }),
  'users.manage': P('users.manage', 'team', 'Filial va loginlar', 'Filial ochish, parol, rol va huquqlarni boshqarish', { feature: 'users', adminOnly: true }),
  'audit.view': P('audit.view', 'audit', 'Amallar tarixi', 'Xodimlar amallari jurnali', { feature: 'audit', adminOnly: true }),
};

/** Huquqlar katalogi versiyasi. Saqlangan ro'yxat eski versiyada bo'lsa — yangi kalitlar `legacy` qoidasi bilan qo'shiladi */
export const PERMISSIONS_VERSION = 2;

/** Sahifa → shu sahifadagi huquqlar (katalog tartibida) */
export function permissionsOfPage(page: PermissionPage): PermissionKey[] {
  return PERMISSION_KEYS.filter((k) => PERMISSIONS[k].page === page);
}

export type TenantRole = 'admin' | 'user';

/** Rol standartlari. admin — hammasi; user (filial login) — kundalik ish uchun yetarli to'plam */
export const ROLE_DEFAULT_PERMISSIONS: Record<TenantRole, readonly PermissionKey[]> = {
  admin: PERMISSION_KEYS,
  user: [
    'sale.create',
    'sale.discount',
    'sale.editPrice',
    'sales.view',
    'kassa.view',
    'kassa.shift',
    'products.view',
    'product.create',
    'product.edit',
    'product.viewCost',
    'catalog.manage',
    'transfer.create',
    'inventory.view',
    'transferred.view',
    'customers.view',
    'customers.manage',
    'debts.view',
    'payment.accept',
    'nasiya.view',
    'daftar.manage',
    'daftar.delete',
    'reports.view',
    'tasks.view',
    'profile.password',
  ],
};

/**
 * 1-versiyada saqlangan aniq ro'yxatni joriy katalogga ko'taradi: yangi kalitlar `legacy` qoidasi
 * bo'yicha qo'shiladi (masalan, ilgari ochiq bo'lgan «Sotuvlarni ko'rish» — hammaga).
 * Shunda yangi huquqlar paydo bo'lganda hech bir xodim kirishni yo'qotmaydi.
 */
export function upgradeLegacyPermissions(list: readonly string[]): string[] {
  const set = new Set(list);
  for (const k of PERMISSION_KEYS) {
    const rule = PERMISSIONS[k].legacy;
    if (!rule || set.has(k)) continue;
    if (rule === 'open' || set.has(rule)) set.add(k);
  }
  return [...set];
}

export function isPermissionKey(v: unknown): v is PermissionKey {
  return typeof v === 'string' && (PERMISSION_KEYS as readonly string[]).includes(v);
}

export interface PermissionSubject {
  role: string;
  permissions?: readonly string[] | null;
  /** Ro'yxat qaysi katalog versiyasida saqlangan (yo'q — 1) */
  permVersion?: number | null;
}

/** Foydalanuvchining amaldagi huquqlari (to'plam) */
export function effectivePermissions(user: PermissionSubject): Set<PermissionKey> {
  if (user.role === 'admin') return new Set(PERMISSION_KEYS);
  if (user.role !== 'user') return new Set();
  let list: readonly string[] = ROLE_DEFAULT_PERMISSIONS.user;
  if (Array.isArray(user.permissions)) {
    list = (user.permVersion ?? 1) < PERMISSIONS_VERSION ? upgradeLegacyPermissions(user.permissions) : user.permissions;
  }
  // adminOnly huquqlar filial loginga hech qachon berilmaydi (bazada bo'lsa ham)
  return new Set(list.filter((k): k is PermissionKey => isPermissionKey(k) && !PERMISSIONS[k].adminOnly));
}

/**
 * Rol biriktirilgan bo'lsa — huquqlar roldan (rol o'chirilgan/topilmasa — shaxsiy ro'yxatdan).
 * Server tekshiruvi (permissionGuard), /app/users va super panel matritsasi shu bitta qoidadan foydalanadi.
 */
export function effectivePermissionsWithRole(
  user: PermissionSubject,
  role?: { permissions?: readonly string[] | null; permVersion?: number | null } | null,
): Set<PermissionKey> {
  if (role) return effectivePermissions({ role: user.role, permissions: role.permissions ?? [], permVersion: role.permVersion });
  return effectivePermissions(user);
}

/** Rol shablonining amaldagi ro'yxati (eski versiyadagi rol ham yangi kalitlar bilan ko'rsatiladi) */
export function rolePermissionList(role: { permissions?: readonly string[] | null; permVersion?: number | null }): PermissionKey[] {
  const set = effectivePermissions({ role: 'user', permissions: role.permissions ?? [], permVersion: role.permVersion });
  return PERMISSION_KEYS.filter((k) => set.has(k));
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
