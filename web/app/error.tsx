'use client';

import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDb =
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('MongoServerSelectionError') ||
    error.message.includes('MongooseServerSelectionError');

  return (
    <html lang="uz">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 40 }}>
        <h1>{isDb ? 'MongoDB ulanmadi' : 'Xatolik'}</h1>
        <p>
          {isDb
            ? 'MongoDB ni ishga tushiring: mongod --dbpath /opt/homebrew/var/mongodb'
            : error.message}
        </p>
        {error.digest && <p style={{ color: '#666' }}>Digest: {error.digest}</p>}
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button type="button" onClick={reset}>Qayta urinish</button>
          <Link href="/">Bosh sahifa</Link>
        </div>
      </body>
    </html>
  );
}
