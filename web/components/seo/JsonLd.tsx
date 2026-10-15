import { siteUrl } from '@/lib/siteUrl';

/**
 * Schema.org JSON-LD — Google'ga mahsulot haqida tuzilgan ma'lumot (SoftwareApplication + Organization).
 * Faqat landing sahifada (app/page.tsx) ishlatiladi:
 *   import SavoraJsonLd from '@/components/seo/JsonLd';
 *   ... <SavoraJsonLd /> (sahifa JSX'ining istalgan joyida — React 19 uni to'g'ri chiqaradi)
 *
 * Kontent statik (foydalanuvchi ma'lumoti yo'q) — `<` belgisi ekranlanadi (XSS himoyasi).
 */
export function savoraJsonLd(base = siteUrl()) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Savora',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Savdo, ombor va nasiya hisobi',
      operatingSystem: 'Web, Android, iOS',
      inLanguage: 'uz',
      url: base,
      image: `${base}/opengraph-image`,
      description:
        "Savora — do'konlar uchun ombor, kassa va nasiyani (muddatli to'lov) bitta joydan boshqarish tizimi. Nasiya jadvali, qarzdorlarga eslatma, filiallar, hisobotlar va AI tahlil.",
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'UZS',
        description: 'Bepul sinov muddati',
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

export default function SavoraJsonLd() {
  const json = JSON.stringify(savoraJsonLd()).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
