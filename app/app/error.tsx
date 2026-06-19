'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isDb =
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('MongoServerSelectionError') ||
    error.message.includes('MongooseServerSelectionError');

  return (
    <div className="auth-wrap">
      <div className="auth-card auth-card--wide">
        <h1 className="auth-title">{isDb ? 'Baza ulanmadi' : 'Xatolik yuz berdi'}</h1>
        <p className="auth-subtitle">
          {isDb
            ? "MongoDB ishlamayapti. Terminalda mongod ni ishga tushiring, so'ng seed qiling: node --env-file=.env scripts/seed.mjs"
            : 'Kutilmagan server xatosi. Qayta urinib ko\'ring.'}
        </p>
        {error.digest && <p className="field-hint">Digest: {error.digest}</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={reset}>Qayta urinish</button>
          <Link href="/login" className="btn btn-ghost">Login sahifasi</Link>
        </div>
      </div>
    </div>
  );
}
