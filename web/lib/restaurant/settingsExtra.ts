/**
 * Restoran sozlamalari sahifalari (/app/restaurant/*) uchun qo'shimcha server yordamchilari.
 * queries.ts/setup.ts o'zgarmasligi uchun alohida fayl:
 *  - settingsPageContext: sahifa uchun kontekst (modul + `tables.manage` tekshiruvi, do'kon nomi).
 * Menyu muharriri endi alohida bo'lim — /app/menu (lib/restaurant/menuAdmin.ts).
 */
import { redirect } from 'next/navigation';
import { getTenantSession } from '../tenantSession';
import { loadUserPermissions } from '../permissionGuard';
import { getDict } from '../i18n/server';
import type { PermissionKey } from '../permissions';
import type { RestaurantCtx } from './context';

export interface SettingsPageContext {
  ctx: RestaurantCtx;
  org: { name: string; slug: string };
}

/**
 * Sozlama sahifasi konteksti: `tables` moduli o'chiq bo'lsa — /app/locked?m=tables, `tables.manage`
 * huquqi bo'lmasa — /app/locked?p=tables.manage (requirePermission bilan bir xil yo'naltirish).
 */
export async function settingsPageContext(): Promise<SettingsPageContext> {
  const { user, org, features, ...models } = await getTenantSession();
  if (!features.tables) redirect('/app/locked?m=tables');
  const [perms, d] = await Promise.all([loadUserPermissions(user), getDict()]);
  const need: PermissionKey = 'tables.manage';
  if (!perms.has(need)) redirect(`/app/locked?p=${encodeURIComponent(need)}`);
  return {
    ctx: { user, orgId: String(org._id), orgSlug: org.slug, m: models, perms, features, d },
    org: { name: org.name, slug: org.slug },
  };
}
