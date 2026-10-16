import type { Locale } from '../config';
import * as common from './common';
import * as catalog from './catalog';
import * as landing from './landing';
import * as auth from './auth';
import * as shell from './shell';
import * as sales from './sales';
import * as stock from './stock';
import * as crm from './crm';
import * as superPanel from './superPanel';
import * as ui from './ui';

/**
 * Barcha bo'lim lug'atlari. Yangi bo'lim qo'shish: dict/<nom>.ts yarating (uz + ru: typeof uz),
 * shu yerga ikkala tilga ham qo'shing. tests/i18n.test.ts kalit paritetini tekshiradi.
 */
export const dictionaries = {
  uz: {
    common: common.uz,
    catalog: catalog.uz,
    landing: landing.uz,
    auth: auth.uz,
    shell: shell.uz,
    sales: sales.uz,
    stock: stock.uz,
    crm: crm.uz,
    superPanel: superPanel.uz,
    ui: ui.uz,
  },
  ru: {
    common: common.ru,
    catalog: catalog.ru,
    landing: landing.ru,
    auth: auth.ru,
    shell: shell.ru,
    sales: sales.ru,
    stock: stock.ru,
    crm: crm.ru,
    superPanel: superPanel.ru,
    ui: ui.ru,
  },
} satisfies Record<Locale, unknown>;

export type Dict = (typeof dictionaries)['uz'];

export function getDictionary(locale: Locale): Dict {
  return dictionaries[locale];
}
