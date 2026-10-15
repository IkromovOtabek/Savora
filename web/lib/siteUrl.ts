/** Saytning ommaviy (kanonik) manzili — SEO, sitemap, OG uchun. Oxirida "/" yo'q. */
export function siteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (raw) return raw;
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN || process.env.ROOT_DOMAIN;
  if (root && root !== 'lvh.me' && root !== 'localhost') return `https://${root}`;
  return 'http://localhost:3000';
}

/** Indekslanadigan ommaviy sahifalar (sitemap.xml) */
export const PUBLIC_PAGES: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/register', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/login', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/help', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
];
