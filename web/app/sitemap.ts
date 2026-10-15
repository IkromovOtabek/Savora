import type { MetadataRoute } from 'next';
import { PUBLIC_PAGES, siteUrl } from '@/lib/siteUrl';

/** /sitemap.xml — faqat ommaviy sahifalar (kabinet, super panel, do'kon sahifalari kirmaydi). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();
  return PUBLIC_PAGES.map((p) => ({
    url: `${base}${p.path === '/' ? '' : p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
