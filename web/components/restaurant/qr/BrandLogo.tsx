'use client';

import { useState } from 'react';

/** Restoran logosi; rasm yo'q yoki ochilmasa — nomning bosh harfi (brend rangida). Stol va mijoz sahifasida bir xil */
export default function BrandLogo({ url, name }: { url: string | null; name: string }) {
  const [ok, setOk] = useState(!!url);
  if (url && ok) {
    // eslint-disable-next-line @next/next/no-img-element -- tashqi (R2/CDN) rasm
    return <img className="qm-logo" src={url} alt="" width={64} height={64} decoding="async" onError={() => setOk(false)} />;
  }
  return <span className="qm-logo qm-logo--letter" aria-hidden>{name.trim().charAt(0).toUpperCase() || '•'}</span>;
}
