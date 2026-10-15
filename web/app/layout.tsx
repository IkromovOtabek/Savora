import type { Metadata, Viewport } from 'next';
import { Onest } from 'next/font/google';
import './globals.css';
import Toaster from '@/components/ui/Toaster';
import PWARegister from '@/components/PWARegister';
import VisitTracker from '@/components/analytics/VisitTracker';
import { siteUrl } from '@/lib/siteUrl';

// Onest — tizim shrifti (SF) bo'lmagan qurilmalar uchun zaxira (globals.css: --font-sans)
const onest = Onest({ subsets: ['latin', 'cyrillic'], variable: '--font-onest', display: 'swap' });

const SITE_TITLE = 'Savora — Do\'koningiz uchun zamonaviy savdo va nasiya tizimi';
const SITE_DESCRIPTION =
  'Savora — ombor, kassa, nasiya va shartnomani bitta joydan boshqaring. Qarzdorlarga avtomatik eslatma, filiallar, hisobotlar. Bepul sinab ko\'ring.';

export const metadata: Metadata = {
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
    'shartnoma',
    'Savora',
  ],
  // './' — har sahifa o'z manziliga kanonik (Next metadataBase + joriy yo'l)
  alternates: { canonical: './' },
  openGraph: {
    type: 'website',
    siteName: 'Savora',
    locale: 'uz_UZ',
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
(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" className={onest.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning>
        {children}
        <VisitTracker />
        <Toaster />
        <PWARegister />
      </body>
    </html>
  );
}
