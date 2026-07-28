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

/**
 * Foydalanuvchi istagan manzilni oladi va AVTOMATIK unikal slug qaytaradi.
 * Band yoki reserved bo'lsa — `-2`, `-3` ... qo'shadi. Bo'sh/qisqa bo'lsa — "dokon".
 * Shunday qilib "manzil band" xatosi chiqmaydi, lekin tenant bazalari (biznes_<slug>) aralashmaydi.
 * `isTaken` — DB tekshiruvi (chaqiruvchi beradi; slug.ts DB'ga bog'lanmaydi).
 */
export async function ensureUniqueSlug(
  rawInput: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  let base = normalizeSlug(rawInput);
  if (base.length < 3) base = base ? `dokon-${base}` : 'dokon';
  base = base.slice(0, 26); // suffiks (-NN) uchun joy qoldiramiz
  let slug = base;
  let n = 1;
  // Xavfsizlik uchun cheksiz sikldan qochamiz (juda kam ehtimol)
  while ((RESERVED_SLUGS.has(slug) || (await isTaken(slug))) && n < 1000) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

export { tenantLoginUrl, tenantAppUrl as orgPublicUrl };
