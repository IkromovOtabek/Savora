import type { FeatureKey } from '@/lib/features';
import type { IconName } from '@/components/icons/Icon';
import type { PermissionKey } from '@/lib/permissions';

/**
 * Tenant menyusi (sidebar + mobil tab bar) konfiguratsiyasi va foydalanuvchi
 * tartibini (navLayout) qo'llash. Server (saqlashda tekshirish) va client (chizish) bir xil ishlatadi.
 */

export type NavLink = {
  href: string;
  label: string;
  /** modul o'chiq bo'lsa yashiriladi */
  feature?: FeatureKey;
  /** xodimda huquq bo'lmasa yashiriladi */
  permission?: PermissionKey;
  adminOnly?: boolean;
  imeiOnly?: boolean;
  exact?: boolean;
};

export type NavGroup = { title: string; links: NavLink[] };

export const NAV_ICONS: Record<string, IconName> = {
  '/app': 'home',
  '/app/sales': 'cart',
  '/app/debts': 'bell',
  '/app/kassa': 'wallet',
  '/app/products': 'box',
  '/app/inventory': 'clipboard',
  '/app/imei': 'search',
  '/app/monitoring': 'chart',
  '/app/users': 'users',
  '/app/profile': 'settings',
  '/app/kirim-chiqim': 'repeat',
  '/app/kredit-kassa': 'plans',
  '/app/customers': 'user',
  '/app/suppliers': 'store',
  '/app/branches': 'building',
  '/app/transferred': 'send',
  '/app/audit': 'history',
  '/app/daftar': 'edit',
  '/app/nasiya': 'clock',
  '/app/ai': 'sparkles',
  '/app/tasks': 'check',
};

/** Tor (ikonli) menyuda har bir bo'lim bitta ikonka bilan ko'rinadi */
export const GROUP_ICONS: Record<string, IconName> = {
  Savdo: 'cart',
  Mijozlar: 'user',
  Ombor: 'box',
  Moliya: 'wallet',
  Boshqaruv: 'settings',
};

/** Menyu ko'rinishi cookie'si: 'wide' — yozuvli keng menyu, aks holda tor ikonli panel */
export const NAV_MODE_COOKIE = 'savora_nav';

// Bo'limlar bo'yicha guruhlangan standart menyu. Ko'rinish qoidalari (modul, huquq, admin) shu yerda.
export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Savdo',
    links: [
      // Bosh sahifa admin uchun ham ko'rinadi (dashboard admin'da barcha filiallar bo'yicha ishlaydi)
      { href: '/app', label: 'Bosh sahifa', exact: true },
      { href: '/app/sales', label: 'Sotuvlar', feature: 'sales' },
      { href: '/app/transferred', label: 'Filialga berildi', feature: 'transferred' },
    ],
  },
  {
    title: 'Mijozlar',
    links: [
      { href: '/app/nasiya', label: 'Nasiya', feature: 'nasiya' },
      { href: '/app/debts', label: 'Qarzdorlik', feature: 'sales' },
      { href: '/app/customers', label: 'Mijozlar', feature: 'sales', permission: 'customers.manage' },
      { href: '/app/daftar', label: 'Daftar', feature: 'daftar', permission: 'daftar.manage' },
    ],
  },
  {
    title: 'Ombor',
    links: [
      { href: '/app/products', label: 'Ombor', feature: 'products' },
      { href: '/app/inventory', label: 'Inventar', feature: 'inventory' },
      { href: '/app/suppliers', label: 'Yetkazib beruvchilar', feature: 'products', permission: 'suppliers.manage' },
      { href: '/app/imei', label: 'IMEI qidirish', imeiOnly: true, adminOnly: true },
    ],
  },
  {
    title: 'Moliya',
    links: [
      { href: '/app/kassa', label: 'Naqd kassa', feature: 'kassa', permission: 'kassa.view' },
      { href: '/app/kredit-kassa', label: 'Kredit kassa', feature: 'creditKassa', adminOnly: true },
      { href: '/app/kirim-chiqim', label: 'Kirim-chiqim', feature: 'kirimChiqim', permission: 'kirimChiqim.manage', adminOnly: true },
      { href: '/app/monitoring', label: 'Hisobot', feature: 'monitoring', permission: 'reports.view' },
    ],
  },
  {
    title: 'Boshqaruv',
    links: [
      { href: '/app/ai', label: 'AI yordamchi', feature: 'ai', permission: 'ai.view' },
      { href: '/app/tasks', label: 'Topshiriqlar', feature: 'tasks' },
      { href: '/app/users', label: 'Filiallar', feature: 'users', permission: 'users.manage', adminOnly: true },
      { href: '/app/audit', label: 'Amallar', feature: 'audit', permission: 'audit.view', adminOnly: true },
      { href: '/app/profile', label: 'Kabinet' },
    ],
  },
];

// Pastki tab bar — standart tartib (foydalanuvchi o'z tartibini saqlamagan bo'lsa)
export const TAB_ORDER = ['/app', '/app/sales', '/app/products', '/app/debts', '/app/nasiya', '/app/kassa', '/app/monitoring', '/app/transferred'];
export const TAB_LABELS: Record<string, string> = {
  '/app': 'Asosiy', '/app/sales': 'Sotuvlar', '/app/products': 'Ombor', '/app/debts': 'Qarzlar',
  '/app/nasiya': 'Nasiya', '/app/kassa': 'Kassa', '/app/monitoring': 'Hisobot', '/app/transferred': 'Berildi',
};

/** Yashirib bo'lmaydigan havolalar — foydalanuvchi o'zini menyusiz qoldirmasin */
export const NAV_PROTECTED = new Set(['/app', '/app/profile']);

/** Foydalanuvchi saqlagan menyu tartibi (User.navLayout) */
export type NavLayout = {
  groups: { title: string; hrefs: string[] }[];
  hidden: string[];
};

const KNOWN_TITLES = new Set(NAV_GROUPS.map((g) => g.title));
const KNOWN_HREFS = new Set(NAV_GROUPS.flatMap((g) => g.links.map((l) => l.href)));

/** Kelgan (ishonchsiz) qiymatni tekshirib, faqat ma'lum guruh/havolalarni qoldiradi. Yaroqsiz bo'lsa null. */
export function sanitizeNavLayout(raw: unknown): NavLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { groups?: unknown; hidden?: unknown };
  if (!Array.isArray(r.groups)) return null;

  const seenTitles = new Set<string>();
  const seenHrefs = new Set<string>();
  const groups: NavLayout['groups'] = [];
  for (const g of r.groups.slice(0, 20)) {
    if (!g || typeof g !== 'object') continue;
    const { title, hrefs } = g as { title?: unknown; hrefs?: unknown };
    if (typeof title !== 'string' || !KNOWN_TITLES.has(title) || seenTitles.has(title)) continue;
    seenTitles.add(title);
    const list: string[] = [];
    if (Array.isArray(hrefs)) {
      for (const h of hrefs.slice(0, 50)) {
        if (typeof h !== 'string' || !KNOWN_HREFS.has(h) || seenHrefs.has(h)) continue;
        seenHrefs.add(h);
        list.push(h);
      }
    }
    groups.push({ title, hrefs: list });
  }

  const hidden = Array.isArray(r.hidden)
    ? [...new Set(r.hidden.filter((h): h is string => typeof h === 'string' && KNOWN_HREFS.has(h) && !NAV_PROTECTED.has(h)))]
    : [];

  return { groups, hidden };
}

/**
 * Standart guruhlarga foydalanuvchi tartibini qo'llaydi.
 * Saqlangan tartibda yo'q (yangi qo'shilgan) havolalar o'zining standart guruhi oxiriga tushadi.
 */
export function applyNavLayout(defaults: NavGroup[], layout: NavLayout | null | undefined): NavGroup[] {
  if (!layout) return defaults;
  const linkByHref = new Map<string, NavLink>();
  const defaultTitleOf = new Map<string, string>();
  for (const g of defaults) {
    for (const l of g.links) {
      linkByHref.set(l.href, l);
      defaultTitleOf.set(l.href, g.title);
    }
  }

  const used = new Set<string>();
  const result: NavGroup[] = [];
  const defaultTitles = new Set(defaults.map((g) => g.title));
  for (const g of layout.groups) {
    if (!defaultTitles.has(g.title) || result.some((x) => x.title === g.title)) continue;
    const links: NavLink[] = [];
    for (const h of g.hrefs) {
      const link = linkByHref.get(h);
      if (!link || used.has(h)) continue;
      used.add(h);
      links.push(link);
    }
    result.push({ title: g.title, links });
  }
  for (const g of defaults) {
    if (!result.some((x) => x.title === g.title)) result.push({ title: g.title, links: [] });
  }
  for (const [href, link] of linkByHref) {
    if (used.has(href)) continue;
    result.find((x) => x.title === defaultTitleOf.get(href))?.links.push(link);
  }
  return result;
}
