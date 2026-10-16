import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from './config';
import { getDictionary, type Dict } from './dict';

/**
 * Server komponent / server action / route uchun joriy til.
 * Cookie yo'q yoki noto'g'ri → standart (uz). Statik kontekstda (cookies() xato) ham uz.
 */
export async function getLocale(): Promise<Locale> {
  try {
    const store = await cookies();
    const v = store.get(LOCALE_COOKIE)?.value;
    return isLocale(v) ? v : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Joriy til lug'ati: const d = await getDict(); d.common.save */
export async function getDict(): Promise<Dict> {
  return getDictionary(await getLocale());
}

/** Til + lug'at birga (sahifalarda qulay): const { locale, d } = await getI18n() */
export async function getI18n(): Promise<{ locale: Locale; d: Dict }> {
  const locale = await getLocale();
  return { locale, d: getDictionary(locale) };
}

export type { Dict, Locale };
