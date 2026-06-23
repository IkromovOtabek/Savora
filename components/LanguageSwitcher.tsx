'use client';

import { useEffect, useState } from 'react';

type Locale = 'uz' | 'ru';

export default function LanguageSwitcher() {
  const [locale, setLocale] = useState<Locale>('uz');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const m = document.cookie.match(/(?:^|;\s*)locale=(uz|ru)/);
    setLocale((m?.[1] as Locale) || 'uz');
    setMounted(true);
  }, []);

  function pick(l: Locale) {
    if (l === locale) return;
    document.cookie = `locale=${l}; path=/; max-age=31536000`;
    window.location.reload();
  }

  if (!mounted) return <span className="lang-switch" aria-hidden suppressHydrationWarning />;

  return (
    <span className="lang-switch" role="group" aria-label="Til / Язык">
      <button type="button" className={`lang-opt${locale === 'uz' ? ' lang-opt--active' : ''}`} onClick={() => pick('uz')}>UZ</button>
      <button type="button" className={`lang-opt${locale === 'ru' ? ' lang-opt--active' : ''}`} onClick={() => pick('ru')}>RU</button>
    </span>
  );
}
