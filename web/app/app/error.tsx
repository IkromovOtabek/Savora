'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Icon from '@/components/icons/Icon';

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
    <div className="t-error" role="alert">
      <span className="t-error-icon"><Icon name="alert" size={26} /></span>
      <h1>{isDb ? 'Baza ulanmadi' : 'Nimadir xato ketdi'}</h1>
      <p>
        {isDb
          ? "Ma'lumotlar bazasiga ulanib bo'lmadi. Birozdan so'ng qayta urinib ko'ring yoki administratorga xabar bering."
          : "Sahifani ochishda kutilmagan xatolik yuz berdi. Ma'lumotlaringiz joyida — qayta urinib ko'ring."}
      </p>
      {error.digest && <code>Xato kodi: {error.digest}</code>}
      <div className="t-error-actions">
        <button type="button" className="t-btn t-btn--filled" onClick={reset}>Qayta urinish</button>
        <Link href="/app" className="t-btn t-btn--gray">Bosh sahifaga qaytish</Link>
      </div>
    </div>
  );
}
