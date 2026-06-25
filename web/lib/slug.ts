import { tenantLoginUrl, tenantAppUrl } from './urls';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

export const RESERVED_SLUGS = new Set([
  'admin', 'www', 'api', 'app', 'super', 'login', 'register', 'static', 'mail', 'ftp', 't',
]);

export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export function validateSlug(slug: string): string | null {
  if (!slug) return 'Manzil (slug) kiritilishi shart.';
  if (slug.length < 3) return 'Manzil kamida 3 ta belgidan iborat bo\'lishi kerak.';
  if (RESERVED_SLUGS.has(slug)) return 'Bu manzil band. Boshqasini tanlang.';
  if (!SLUG_RE.test(slug)) return 'Manzil faqat kichik harf, raqam va tire (-) dan iborat bo\'lishi kerak.';
  return null;
}

export function tenantDbName(slug: string): string {
  return `biznes_${slug}`;
}

export { tenantLoginUrl, tenantAppUrl as orgPublicUrl };
