/**
 * Interfeys tillari. Standart — o'zbek (lotin). Tanlov cookie'da saqlanadi
 * (URL prefiksi yo'q — mavjud marshrutlar va middleware o'zgarmaydi).
 */
export const LOCALES = ['uz', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'uz';

/** Cookie nomi — middleware (?lang=) va server action (setLocale) bir xil ishlatadi */
export const LOCALE_COOKIE = 'savora_lang';

/** 1 yil — til tanlovi sessiyadan uzoq yashaydi */
export const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export const LOCALE_LABELS: Record<Locale, string> = { uz: "O'zbekcha", ru: 'Русский' };
export const LOCALE_SHORT: Record<Locale, string> = { uz: 'UZ', ru: 'RU' };

/** Open Graph / html lang uchun */
export const LOCALE_TAGS: Record<Locale, { html: string; og: string; intl: string }> = {
  uz: { html: 'uz', og: 'uz_UZ', intl: 'uz-UZ' },
  ru: { html: 'ru', og: 'ru_RU', intl: 'ru-RU' },
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}
