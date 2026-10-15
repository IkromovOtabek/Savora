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
    // Batafsil xato serverda log qilinadi (digest bo'yicha topiladi); brauzerda faqat qisqa yozuv
    console.error('App error', error.digest ?? '');
  }, [error]);

  return (
    <div className="auth-wrap">
      <div className="auth-card auth-card--wide">
        <h1 className="auth-title">Xatolik yuz berdi</h1>
        <p className="auth-subtitle">
          Kutilmagan xatolik yuz berdi. Birozdan so&apos;ng qayta urinib ko&apos;ring. Muammo takrorlansa,
          qo&apos;llab-quvvatlash xizmatiga murojaat qiling.
        </p>
        {error.digest && <p className="field-hint">Xato kodi: {error.digest}</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={reset}>Qayta urinish</button>
          <Link href="/login" className="btn btn-ghost">Login sahifasi</Link>
        </div>
      </div>
    </div>
  );
}
