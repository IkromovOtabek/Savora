'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/client';
import { LOCALE_TAGS } from '@/lib/i18n/config';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale, d } = useI18n();
  const isDb =
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('MongoServerSelectionError') ||
    error.message.includes('MongooseServerSelectionError');

  return (
    <html lang={LOCALE_TAGS[locale].html}>
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 40 }}>
        <h1>{isDb ? d.landing.error.dbTitle : d.common.error}</h1>
        <p>
          {isDb
            ? d.landing.error.dbHint
            : 'Kutilmagan xatolik yuz berdi. Sahifani yangilang yoki birozdan so\'ng qayta urinib ko\'ring.'}
        </p>
        {error.digest && <p style={{ color: '#666' }}>Digest: {error.digest}</p>}
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button type="button" onClick={reset}>{d.common.retry}</button>
          <Link href="/">{d.common.home}</Link>
        </div>
      </body>
    </html>
  );
}
