'use server';

/**
 * Restoran «Menyu» bo'limi server action'lari (/app/menu): taom qo'shish/tahrirlash (retsept bilan), ombordagi
 * tovarni menyuga qo'shish/olish, retsept muharriridan tez xom ashyo qo'shish. Mantiq — lib/restaurant/menuAdmin.ts;
 * stop-list va stansiya — app/actions/restaurant.ts (setStopListAction, updateMenuItemAction).
 * Natija: `{ ok: true, data, success? }` yoki `{ ok: false, error, code }`.
 */
import { revalidatePath } from 'next/cache';
import { tr } from '@/lib/i18n/fmt';
import { restaurantCtxFromSession, toAction, type ActionResult } from '@/lib/restaurant/session';
import {
  parseDishInput, quickCreateIngredient, saveMenuDish, setMenuMembership,
  type IngredientInput, type StockOption,
} from '@/lib/restaurant/menuAdmin';

function invalid(error: string): { ok: false; error: string; code: 'badInput' } {
  return { ok: false, error, code: 'badInput' };
}

function revalidateMenu(productId?: string) {
  revalidatePath('/app/menu');
  revalidatePath('/app/products');
  if (productId) revalidatePath(`/app/products/${productId}`);
}

/** Taom/xizmat qo'shish yoki tahrirlash, ombordagi tovarni menyuga qo'shish (kirish — DishInput) */
export async function saveMenuDishAction(input: unknown): Promise<ActionResult<{ id: string; created: boolean; barcode: string | null }>> {
  const ctx = await restaurantCtxFromSession();
  const p = parseDishInput(input);
  if (!p) return invalid(ctx.d.restaurant.errors.badInput);
  const r = await saveMenuDish(ctx, p);
  if (r.ok) revalidateMenu(r.data.id);
  return toAction(r, r.ok ? (r.data.created ? tr(ctx.d.menu.form.created, { name: p.name.trim() }) : ctx.d.menu.form.saved) : undefined);
}

/** Menyuga qaytarish / menyudan olish (mahsulot o'chmaydi) */
export async function setMenuMembershipAction(input: { productId: string; inMenu: boolean }): Promise<ActionResult<{ id: string; name: string; inMenu: boolean }>> {
  const ctx = await restaurantCtxFromSession();
  if (!input || typeof input !== 'object' || typeof input.productId !== 'string' || typeof input.inMenu !== 'boolean') {
    return invalid(ctx.d.restaurant.errors.badInput);
  }
  const r = await setMenuMembership(ctx, input.productId, input.inMenu);
  if (r.ok) revalidateMenu(r.data.id);
  return toAction(r);
}

/** Retsept muharriridan yangi xom ashyo (omborga) */
export async function quickCreateIngredientAction(input: IngredientInput): Promise<ActionResult<StockOption>> {
  const ctx = await restaurantCtxFromSession();
  if (!input || typeof input !== 'object' || typeof input.name !== 'string' || typeof input.unit !== 'string'
    || typeof input.cost !== 'number' || typeof input.qty !== 'number'
    || (input.branchId !== undefined && (typeof input.branchId !== 'string' || !/^[a-f0-9]{24}$/i.test(input.branchId)))) {
    return invalid(ctx.d.restaurant.errors.badInput);
  }
  const r = await quickCreateIngredient(ctx, input);
  if (r.ok) revalidatePath('/app/products');
  return toAction(r, r.ok ? tr(ctx.d.menu.recipe.created, { name: r.data.name }) : undefined);
}
