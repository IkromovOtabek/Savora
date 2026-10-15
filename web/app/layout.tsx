import type { Metadata, Viewport } from 'next';
import { Onest } from 'next/font/google';
import './globals.css';
import Toaster from '@/components/ui/Toaster';
import PWARegister from '@/components/PWARegister';
import VisitTracker from '@/components/analytics/VisitTracker';

// Onest — tizim shrifti (SF) bo'lmagan qurilmalar uchun zaxira (globals.css: --font-sans)
const onest = Onest({ subsets: ['latin', 'cyrillic'], variable: '--font-onest', display: 'swap' });

export const metadata: Metadata = {
  title: 'Savora — Do\'koningiz uchun zamonaviy savdo va nasiya tizimi',
  description:
    'Savora — ombor, kassa, nasiya va shartnomani bitta joydan boshqaring. Bepul sinab ko\'ring.',
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
    apple: '/icon-512.svg',
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
      <body>
        {children}
        <VisitTracker />
        <Toaster />
        <PWARegister />
      </body>
    </html>
  );
}
