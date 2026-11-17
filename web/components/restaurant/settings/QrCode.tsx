'use client';

import { useEffect, useState } from 'react';

/** QR-kod rasmi (SVG, brauzerda `qrcode` paketi bilan; paket faqat kerak bo'lganda yuklanadi) */
export default function QrCode({ value, alt, size = 200 }: { value: string; alt: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    import('qrcode')
      .then((m) => {
        // CommonJS paket: bundler nomlangan eksportni `default` ichida berishi mumkin
        const QR = (m as unknown as { default?: typeof m }).default ?? m;
        return QR.toString(value, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#000000', light: '#ffffff' } });
      })
      .then((svg) => {
        if (alive) setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      })
      .catch(() => {
        if (alive) setSrc('');
      });
    return () => {
      alive = false;
    };
  }, [value]);

  return (
    <span className="rs-qr" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} width={size} height={size} />
      ) : (
        <span className="rs-qr-skel" aria-hidden="true" />
      )}
    </span>
  );
}
