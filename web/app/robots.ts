import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { siteUrl } from '@/lib/siteUrl';

/**
 * /robots.txt
 * - Asosiy domen: ommaviy sahifalar ochiq; kabinet (/app), super panel, tenant (/t/), API, /tg yopiq.
 * - Subdomen rejimida do'kon/admin subdomenlari (dokon.savora.uz) — butunlay yopiq.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = siteUrl();
  const host = ((await headers()).get('host') || '').split(':')[0].toLowerCase();
  const root = (process.env.ROOT_DOMAIN || '').toLowerCase();
  const isSubdomain = !!root && host !== root && host !== `www.${root}` && host.endsWith(`.${root}`);

  if (isSubdomain) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/app$', '/app/', '/super', '/t/', '/api/', '/tg$', '/tg/', '/forgot'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
