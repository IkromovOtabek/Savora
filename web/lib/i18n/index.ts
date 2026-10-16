// Umumiy (server ham, client ham): konfiguratsiya + formatlash yordamchilari.
// Server: '@/lib/i18n/server' (getLocale, getDict). Client: '@/lib/i18n/client' (useDict, useLocale).
export * from './config';
export * from './fmt';
export { getDictionary, type Dict } from './dict';
