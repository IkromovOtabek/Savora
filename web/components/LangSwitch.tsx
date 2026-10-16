'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LOCALES, LOCALE_LABELS, LOCALE_SHORT, type Locale } from '@/lib/i18n/config';
import { useDict, useLocale } from '@/lib/i18n/client';
import { setLocale } from '@/app/actions/locale';
import './lang-switch.css';

/**
 * Interfeys tili almashtirgich (UZ | RU). Cookie'ga yozadi va sahifani yangilaydi —
 * server komponentlar ham yangi tilda chiziladi.
 */
export default function LangSwitch({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const locale = useLocale();
  const d = useDict();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === locale || pending) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div className={`lang-switch${compact ? ' lang-switch--compact' : ''}${pending ? ' is-pending' : ''} ${className}`.trim()} role="group" aria-label={d.common.language}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          className={`lang-switch-btn${l === locale ? ' is-active' : ''}`}
          onClick={() => choose(l)}
          aria-pressed={l === locale}
          title={LOCALE_LABELS[l]}
          lang={l}
        >
          {compact ? LOCALE_SHORT[l] : LOCALE_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
