import type { Metadata, Viewport } from 'next';
import './globals.css';
import Toaster from '@/components/ui/Toaster';
import PWARegister from '@/components/PWARegister';
import VisitTracker from '@/components/analytics/VisitTracker';

export const metadata: Metadata = {
  title: 'Savora — Do\'koningiz uchun zamonaviy savdo va nasiya tizimi',
  description:
    'Savora — ombor, sotuv, nasiya, kassa va filiallarni bitta joydan boshqaring. 7 kun bepul sinab ko\'ring.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Savora',
  },
  // Favicon — app/icon.svg avtomatik; bu yerda faqat apple-touch (PWA ikonkasi)
  icons: {
    apple: '/icon-512.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#4F46E5',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const themeScript = `
(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" suppressHydrationWarning>
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
