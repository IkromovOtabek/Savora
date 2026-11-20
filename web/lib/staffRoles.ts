/**
 * Xodim qo'shish formasidagi rol tanlovi (/app/users): restoran rol shablonlari birinchi (shablon tartibida), har biriga
 * bir qatorli izoh — nima qila oladi (`d.waiterDay.staff.hints`); qolgan rollar — nomi bo'yicha. Sof funksiya (client'da ham).
 * Shablon nomlari — lib/models/tenant/Role.ts → RESTAURANT_ROLES, DEFAULT_ROLES (tests/waiterDay.test.ts mosligini tekshiradi).
 */
import { tr } from './i18n/fmt';

/** RESTAURANT_ROLES tartibi */
export const RESTAURANT_ROLE_NAMES = ['Ofitsant', 'Oshpaz', 'Barmen', 'Kassir (restoran)', 'Administrator'] as const;

export type RoleHintKey = 'waiter' | 'chef' | 'barman' | 'cashierRest' | 'administrator' | 'cashier' | 'seller' | 'manager';

/** Shablon nomi → izoh kaliti (egasi o'zi yaratgan rol — izohsiz, huquqlar soni bilan) */
export const ROLE_HINT_KEYS: Readonly<Record<string, RoleHintKey>> = {
  Ofitsant: 'waiter',
  Oshpaz: 'chef',
  Barmen: 'barman',
  'Kassir (restoran)': 'cashierRest',
  Administrator: 'administrator',
  Kassir: 'cashier',
  Sotuvchi: 'seller',
  Menejer: 'manager',
};

export interface StaffRoleOption {
  id: string;
  name: string;
  permissions: string[];
  /** restaurant — restoran shabloni (forma birinchi ko'rsatadi) */
  group: 'restaurant' | 'other';
  /** Bir qatorli izoh */
  hint: string;
}

/** Rollar → forma tartibi va izohlari. `customHint` — «{n} ta huquq» */
export function staffRoleOptions(
  roles: { id: string; name: string; permissions: string[] }[],
  t: { hints: Record<RoleHintKey, string>; customHint: string },
): StaffRoleOption[] {
  const restIndex = (name: string) => (RESTAURANT_ROLE_NAMES as readonly string[]).indexOf(name);
  const hint = (r: { name: string; permissions: string[] }) => {
    const key = ROLE_HINT_KEYS[r.name];
    return key ? t.hints[key] : tr(t.customHint, { n: r.permissions.length });
  };
  const rest = roles.filter((r) => restIndex(r.name) >= 0).sort((a, b) => restIndex(a.name) - restIndex(b.name));
  const other = roles.filter((r) => restIndex(r.name) < 0).sort((a, b) => a.name.localeCompare(b.name));
  return [
    ...rest.map((r) => ({ ...r, group: 'restaurant' as const, hint: hint(r) })),
    ...other.map((r) => ({ ...r, group: 'other' as const, hint: hint(r) })),
  ];
}
