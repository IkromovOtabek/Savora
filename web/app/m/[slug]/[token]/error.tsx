'use client';

import { useEffect } from 'react';
import { useDict } from '@/lib/i18n/client';
import QrState from '@/components/restaurant/qr/QrState';

/** Kutilmagan xato (baza/server) — mijozga tushunarli sahifa va qayta urinish */
export default function QrMenuError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const d = useDict();
  const q = d.restaurant.qrMenu;
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <QrState
      icon="alert"
      tone="warn"
      title={q.errorTitle}
      text={q.errorText}
      action={<button type="button" className="qm-btn qm-btn--ghost" onClick={() => reset()}>{d.common.retry}</button>}
    />
  );
}
