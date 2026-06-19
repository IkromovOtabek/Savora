/**
 * Lokal ishlab chiqish uchun localhost:3000 path marshrutlari.
 * Production'da subdomen rejimi ishlatiladi.
 */

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export function usePathRouting(): boolean {
  if (process.env.NEXT_PUBLIC_USE_PATH_ROUTING === 'false') return false;
  if (process.env.NEXT_PUBLIC_USE_PATH_ROUTING === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}

function rootDomain(): string {
  return process.env.NEXT_PUBLIC_ROOT_DOMAIN || process.env.ROOT_DOMAIN || 'lvh.me';
}

/** Platforma egasi — kirish */
export function superLoginUrl(): string {
  if (usePathRouting()) return `${APP_BASE}/super/login`;
  const root = rootDomain();
  return process.env.NODE_ENV !== 'production'
    ? `http://admin.${root}:3000/login`
    : `https://admin.${root}/login`;
}

/** Super admin panel */
export function superDashboardUrl(path = '/super'): string {
  if (usePathRouting()) return `${APP_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const root = rootDomain();
  const p = path.startsWith('/') ? path : `/${path}`;
  return process.env.NODE_ENV !== 'production'
    ? `http://admin.${root}:3000${p}`
    : `https://admin.${root}${p}`;
}

/** Do'kon egasi / xodim kirishi */
export function tenantLoginUrl(slug: string, query = ''): string {
  const q = query ? (query.startsWith('?') ? query : `?${query}`) : '';
  if (usePathRouting()) return `${APP_BASE}/t/${slug}/login${q}`;
  const root = rootDomain();
  return process.env.NODE_ENV !== 'production'
    ? `http://${slug}.${root}:3000/login${q}`
    : `https://${slug}.${root}/login${q}`;
}

/** Do'kon paneli (login qilingandan keyin) */
export function tenantAppUrl(slug: string, path = '/app'): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (usePathRouting()) {
    if (p === '/login') return tenantLoginUrl(slug);
    return `${APP_BASE}${p}`;
  }
  const root = rootDomain();
  return process.env.NODE_ENV !== 'production'
    ? `http://${slug}.${root}:3000${p}`
    : `https://${slug}.${root}${p}`;
}

/** Do'kon moduli havolasi (super admin uchun ko'rsatish) */
export function moduleLink(slug: string, route: string): string {
  if (usePathRouting()) return `${APP_BASE}${route}`;
  return tenantAppUrl(slug, route);
}

/** Marketing / ro'yxatdan o'tish */
export function rootUrl(path = '/'): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (usePathRouting()) return `${APP_BASE}${p}`;
  const root = rootDomain();
  return process.env.NODE_ENV !== 'production'
    ? `http://${root}:3000${p}`
    : `https://${root}${p}`;
}

export const LOCALHOST_LINKS = {
  marketing: `${APP_BASE}/`,
  register: `${APP_BASE}/register`,
  superLogin: `${APP_BASE}/super/login`,
  superPanel: `${APP_BASE}/super`,
  superNewOrg: `${APP_BASE}/super/organizations/new`,
} as const;
