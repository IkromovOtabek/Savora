import { siteUrl } from '@/lib/siteUrl';
import { getI18n } from '@/lib/i18n/server';
import { getDictionary } from '@/lib/i18n/dict';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';

/**
 * Schema.org JSON-LD — Google'ga mahsulot haqida tuzilgan ma'lumot (SoftwareApplication + Organization).
 * Faqat landing sahifada (app/page.tsx) ishlatiladi:
 *   import SavoraJsonLd from '@/components/seo/JsonLd';
 *   ... <SavoraJsonLd /> (sahifa JSX'ining istalgan joyida — React 19 uni to'g'ri chiqaradi)
 *
 * Kontent statik (foydalanuvchi ma'lumoti yo'q) — `<` belgisi ekranlanadi (XSS himoyasi).
 */
export function savoraJsonLd(base = siteUrl(), locale: Locale = DEFAULT_LOCALE) {
  const t = getDictionary(locale).landing.seo;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Savora',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: t.subCategory,
      operatingSystem: 'Web, Android, iOS',
      inLanguage: locale,
      url: base,
      image: `${base}/opengraph-image`,
      description: t.description,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'UZS',
        description: t.offer,
      },
      publisher: { '@type': 'Organization', name: 'Savora', url: base },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Savora',
      url: base,
      logo: `${base}/icon-512.svg`,
      areaServed: 'UZ',
    },
  ];
}

export default async function SavoraJsonLd() {
  const { locale } = await getI18n();
  const json = JSON.stringify(savoraJsonLd(siteUrl(), locale)).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
