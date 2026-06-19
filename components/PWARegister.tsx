'use client';

import { useEffect } from 'react';

/** Service worker'ni ro'yxatdan o'tkazadi (PWA — offline + "telefonga o'rnatish"). */
export default function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return; // dev'da SW o'chirilgan

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
