import type { Locale } from './config';
import type { ProductUnit } from '../businessTypes';
import { fmtQty } from '../qty';
import { qtyByUnitEntries, type QtyByUnit } from '../unitTotals';

/**
 * Lug'at satriga parametr qo'yish: tr('{n} ta mahsulot', { n: 5 }) → '5 ta mahsulot'.
 * Noma'lum kalit — o'z holicha qoladi (xato bermaydi).
 */
export function tr(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/**
 * Rus tilida son bilan kelishish: plural(5, ['товар', 'товара', 'товаров']) → 'товаров'.
 * O'zbekchada bitta shakl kifoya — forms[0] qaytadi.
 */
export function plural(n: number, forms: readonly [string, string, string] | readonly [string]): string {
  if (forms.length === 1) return forms[0];
  const a = Math.abs(Math.round(n)) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export const MONTHS: Record<Locale, readonly string[]> = {
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  ru: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
};

/** Rus tilida «15 марта» ko'rinishi uchun qaratqich kelishigi */
export const MONTHS_GENITIVE: Record<Locale, readonly string[]> = {
  uz: MONTHS.uz,
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
};

export const MONTHS_SHORT: Record<Locale, readonly string[]> = {
  uz: ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'],
  ru: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
};

/** Yakshanbadan boshlanadi (Date.getDay() bilan mos) */
export const WEEKDAYS: Record<Locale, readonly string[]> = {
  uz: ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'],
  ru: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
};

export const WEEKDAYS_SHORT: Record<Locale, readonly string[]> = {
  uz: ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'],
  ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
};

/** «2026-yil oktabr» / «октябрь 2026» */
export function fmtMonthYear(d: Date | string, locale: Locale): string {
  const dt = new Date(d);
  const m = MONTHS[locale][dt.getMonth()];
  return locale === 'ru' ? `${m} ${dt.getFullYear()}` : `${dt.getFullYear()}-yil ${m}`;
}

/** «15-oktabr» / «15 октября» */
export function fmtDayMonth(d: Date | string, locale: Locale): string {
  const dt = new Date(d);
  return locale === 'ru' ? `${dt.getDate()} ${MONTHS_GENITIVE.ru[dt.getMonth()]}` : `${dt.getDate()}-${MONTHS.uz[dt.getMonth()]}`;
}

/**
 * Miqdor + lug'atdagi birlik nomi: qtyWithUnit(1.5, 'kg', d.stock.fields.units) → '1,5 kg'.
 * Birligi yo'q mahsulot — "dona" (ru: "шт.").
 */
export function qtyWithUnit(n: number, unit: string | null | undefined, units: Record<ProductUnit, string>): string {
  const label = (unit && units[unit as ProductUnit]) || units.dona;
  return `${fmtQty(n)} ${label}`;
}

/**
 * Birlik bo'yicha yig'indi: qtyByUnits({ dona: 12, kg: 3.5 }, units) → '12 dona · 3,5 kg'.
 * Bo'sh yig'indi — '0 dona'.
 */
export function qtyByUnits(totals: QtyByUnit, units: Record<ProductUnit, string>): string {
  const e = qtyByUnitEntries(totals);
  if (e.length === 0) return qtyWithUnit(0, 'dona', units);
  return e.map(([u, n]) => qtyWithUnit(n, u, units)).join(' · ');
}
