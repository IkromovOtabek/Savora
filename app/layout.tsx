import type { Metadata } from 'next';
import './globals.css';
import Toaster from '@/components/ui/Toaster';

export const metadata: Metadata = {
  title: 'Savora — Do\'koningiz uchun zamonaviy savdo va nasiya tizimi',
  description:
    'Savora — ombor, sotuv, nasiya, kassa va filiallarni bitta joydan boshqaring. 7 kun bepul sinab ko\'ring.',
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
        <Toaster />
      </body>
    </html>
  );
}
