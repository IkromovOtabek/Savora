'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const d = useDict();
  const t = d.shell.error;
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
      <h1>{isDb ? t.dbTitle : t.title}</h1>
      <p>{isDb ? t.dbText : t.text}</p>
      {error.digest && <code>{t.code}{error.digest}</code>}
      <div className="t-error-actions">
        <button type="button" className="t-btn t-btn--filled" onClick={reset}>{d.common.retry}</button>
        <Link href="/app" className="t-btn t-btn--gray">{t.backHome}</Link>
      </div>
    </div>
  );
}
