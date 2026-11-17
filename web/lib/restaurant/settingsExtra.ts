/**
 * Restoran sozlamalari sahifalari (/app/restaurant/*) uchun qo'shimcha server yordamchilari.
 * queries.ts/setup.ts o'zgarmasligi uchun alohida fayl:
 *  - settingsPageContext: sahifa uchun kontekst (modul + `tables.manage` tekshiruvi, do'kon nomi);
 *  - menuEditorView: menyu muharriri — buildMenu (tugagan tovar ham, MXIK bilan) + filial stansiyalari.
 */
import { redirect } from 'next/navigation';
import { getTenantSession } from '../tenantSession';
import { loadUserPermissions } from '../permissionGuard';
import { getDict } from '../i18n/server';
import type { PermissionKey } from '../permissions';
import { buildMenu, type MenuItemView } from './queries';
import { resolveBranchId } from './ops';
import { needFeature, needPerm, ok, type OpResult, type RestaurantCtx } from './context';
import type { StationKind } from './types';

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

/** Admin uchun faol filiallar (tanlash); filial xodimiga — bo'sh */
async function branchesFor(ctx: RestaurantCtx): Promise<{ id: string; name: string; isMain: boolean }[]> {
  if (ctx.user.role !== 'admin') return [];
  const list = await ctx.m.Branch.find({ active: true }).select('name isMain').sort({ createdAt: 1 }).lean();
  return list.map((b) => ({ id: String(b._id), name: b.name, isMain: !!b.isMain }));
}

/** Menyu muharriri qatori (MXIK — MenuItemView.ikpu) */
export type MenuEditorItem = MenuItemView;

export interface MenuEditorView {
  branchId: string;
  branches: { id: string; name: string; isMain: boolean }[];
  categories: string[];
  items: MenuEditorItem[];
  stations: { id: string; name: string; kind: StationKind; active: boolean }[];
}

/** Menyu muharriri: filialdagi sotuvdagi taomlar + MXIK + stansiyalar (`tables` + `tables.manage`) */
export async function menuEditorView(ctx: RestaurantCtx, input: { branchId?: string } = {}): Promise<OpResult<MenuEditorView>> {
  const denied = needFeature(ctx, 'tables') ?? needPerm(ctx, 'tables.manage');
  if (denied) return denied;
  const br = await resolveBranchId(ctx, input.branchId);
  if (!br.ok) return br;
  const branchId = br.data;
  const [menu, stations, branches] = await Promise.all([
    // Muharrirda tugagan tovar ham ko'rinadi (kelishidan oldin stansiya/modifikator sozlansin)
    buildMenu(ctx.m, branchId, { withSoldOut: true }),
    ctx.m.KitchenStation.find({ branchId }).sort({ sort: 1, createdAt: 1 }).select('name kind active').lean(),
    branchesFor(ctx),
  ]);
  return ok({
    branchId,
    branches,
    categories: menu.categories,
    items: menu.items,
    stations: stations.map((s) => ({ id: String(s._id), name: s.name, kind: s.kind, active: s.active })),
  });
}
