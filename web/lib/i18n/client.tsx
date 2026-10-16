'use client';

import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_LOCALE, type Locale } from './config';
import { getDictionary, type Dict } from './dict';

/**
 * Client komponentlar uchun til konteksti. Root layout `locale`ni beradi; lug'at
 * client bundle'da (ikkala til ham) — RSC payload har sahifada kattalashmaydi.
 */
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** const d = useDict(); d.common.save */
export function useDict(): Dict {
  const locale = useContext(LocaleContext);
  return useMemo(() => getDictionary(locale), [locale]);
}

export function useI18n(): { locale: Locale; d: Dict } {
  const locale = useContext(LocaleContext);
  return useMemo(() => ({ locale, d: getDictionary(locale) }), [locale]);
}

export type { Dict, Locale };
