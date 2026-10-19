import type { Metadata, Viewport } from 'next';
import { Onest, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import Toaster from '@/components/ui/Toaster';
import PWARegister from '@/components/PWARegister';
import VisitTracker from '@/components/analytics/VisitTracker';
import { siteUrl } from '@/lib/siteUrl';
import { getLocale } from '@/lib/i18n/server';
import { I18nProvider } from '@/lib/i18n/client';
import { LOCALE_TAGS, type Locale } from '@/lib/i18n/config';

// Plus Jakarta Sans — asosiy shrift (geometrik, Gilroy uslubida); Onest — kirill harflari uchun zaxira (globals.css: --font-sans)
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600', '700', '800'], variable: '--font-jakarta', display: 'swap' });
const onest = Onest({ subsets: ['latin', 'cyrillic'], variable: '--font-onest', display: 'swap' });

// Sayt sarlavhasi va tavsifi — tilga qarab (cookie: savora_lang)
const SITE_META: Record<Locale, { title: string; description: string }> = {
  uz: {
    title: 'Savora — Do\'koningiz uchun zamonaviy savdo va nasiya tizimi',
    description:
      'Savora — ombor, kassa va nasiyani bitta joydan boshqaring. Qarzdorlarga eslatma, filiallar, hisobotlar va AI tahlil. Bepul sinab ko\'ring.',
  },
  ru: {
    title: 'Savora — современная система продаж и рассрочки для вашего магазина',
    description:
      'Savora — склад, касса и рассрочка в одном месте. Напоминания должникам, филиалы, отчёты и AI-аналитика. Попробуйте бесплатно.',
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const SITE_TITLE = SITE_META[locale].title;
  const SITE_DESCRIPTION = SITE_META[locale].description;
  return {
    // NEXT_PUBLIC_APP_URL — OG rasm, canonical va boshqa nisbiy URL'lar shu asosda to'liq bo'ladi
    metadataBase: new URL(siteUrl()),
    // Sahifa sarlavhalari allaqachon "… — Savora" ko'rinishida yoziladi, shuning uchun shablon '%s'
    title: { default: SITE_TITLE, template: '%s' },
    description: SITE_DESCRIPTION,
    applicationName: 'Savora',
    keywords: [
      'nasiya',
      'nasiya dasturi',
      'muddatli to\'lov',
      'qarz daftari',
      'savdo dasturi',
      'ombor hisobi',
      'kassa dasturi',
      'do\'kon uchun dastur',
      'telefon do\'koni',
      'IMEI',
      'Savora',
    ],
    // './' — har sahifa o'z manziliga kanonik (Next metadataBase + joriy yo'l)
    alternates: { canonical: './' },
    openGraph: {
      type: 'website',
      siteName: 'Savora',
      locale: LOCALE_TAGS[locale].og,
      url: './',
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
    },
    twitter: {
      card: 'summary_large_image',
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
    },
    formatDetection: { telephone: false },
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: 'Savora',
    },
    // Favicon — to'ldirilgan indigo ikonka (tabda aniq ko'rinadi)
    icons: {
      icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
      shortcut: '/icon.svg',
      // iOS SVG apple-touch-icon'ni qo'llamaydi — PNG (app/icons/[file]/route.tsx)
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f4f9' },
    { media: '(prefers-color-scheme: dark)', color: '#05080f' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const themeScript = `
(function(){try{var t=localStorage.getItem('theme');if(!t){var p=location.pathname;t=/^\\/(app|super|login|register|forgot|t)(\\/|$)/.test(p)||window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'||t==='black'){document.documentElement.classList.add('dark');}if(t==='black'){document.documentElement.classList.add('qora');}}catch(e){}})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={LOCALE_TAGS[locale].html} className={`${jakarta.variable} ${onest.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning>
        <I18nProvider locale={locale}>
          {children}
          <VisitTracker />
          <Toaster />
          <PWARegister />
        </I18nProvider>
      </body>
    </html>
  );
}
