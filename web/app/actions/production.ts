'use server';

/**
 * Ishlab chiqarish server action'lari (web): texkarta, ishlab chiqarish akti, ishbay. Har biri: sessiya →
 * modul/huquq (lib/production ichida) → zod → amal. Natija: `{ ok: true, data, success? }` yoki
 * `{ ok: false, error, code, details? }` (useToastOnState bilan mos). Hammasi object argument oladi (FormData emas).
 * To'liq ro'yxat va kirish/chiqish shakllari: docs/SEX_API.md. Kirim va xarid — app/actions/receipts.ts.
 */
import { revalidatePath } from 'next/cache';
import { parseInput } from '@/lib/validation';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import { fmtQty } from '@/lib/qty';
import { productionCtxFromSession, toAction, type ActionResult } from '@/lib/production/session';
import { productionSchemas } from '@/lib/production/inputs';
import * as recipes from '@/lib/production/recipes';
import * as orders from '@/lib/production/orders';
import * as piecework from '@/lib/production/piecework';

async function prep() {
  const ctx = await productionCtxFromSession();
  return { ctx, s: productionSchemas(ctx.d.production.errors), t: ctx.d.production };
}

function invalid(error: string): { ok: false; error: string; code: 'badInput' } {
  return { ok: false, error, code: 'badInput' };
}

/* ───────────────────────────── texkarta ───────────────────────────── */

/** Texkarta yaratish (`id` yo'q) yoki o'zgartirish. Tarkib o'zgarsa — yangi versiya (`versionBumped`) */
export async function saveRecipeAction(input: recipes.RecipeInput): Promise<ActionResult<{ recipe: recipes.RecipeView; created: boolean; versionBumped: boolean }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.recipe, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await recipes.saveRecipe(ctx, {
    ...p.data,
    id: p.data.id,
    operations: (p.data.operations ?? []).map((o) => ({ name: o.name, rate: o.rate ?? 0, normMin: o.normMin })),
    items: p.data.items.map((i) => ({ productId: i.productId, qty: i.qty, unit: i.unit ?? null, lossPct: i.lossPct })),
  });
  if (r.ok) revalidatePath('/app/production/recipes');
  return toAction(r, r.ok ? (r.data.versionBumped ? tr(t.msg.recipeNewVersion, { v: r.data.recipe.version }) : t.msg.recipeSaved) : undefined);
}

/** Arxivga olish (`active: false`) / faollashtirish */
export async function setRecipeActiveAction(input: { id: string; active: boolean }): Promise<ActionResult<{ recipe: recipes.RecipeView }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.recipeActive, input, t.errors.recipeNotFound);
  if (!p.ok) return invalid(p.error);
  const r = await recipes.setRecipeActive(ctx, p.data.id, p.data.active);
  if (r.ok) revalidatePath('/app/production/recipes');
  return toAction(r, p.data.active ? t.msg.recipeRestored : t.msg.recipeArchived);
}

/** Ehtiyoj hisobi (o'qish, lekin client komponentdan qulay): N birlik uchun xom ashyo, qoldiq, yetishmovchilik */
export async function recipeRequirementsAction(input: { recipeId: string; qty: number; branchId?: string }): Promise<ActionResult<recipes.Requirements>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.requirements, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  return toAction(await recipes.getRequirements(ctx, p.data));
}

/* ───────────────────────────── ishlab chiqarish akti ───────────────────────────── */

function orderIdOf(s: ReturnType<typeof productionSchemas>, id: unknown, msg: string) {
  return parseInput(s.id, { id }, msg);
}

/** Akt ochish. `clientId` — takroriy bosishdan himoya (o'sha akt qaytadi, `existing: true`) */
export async function createProductionOrderAction(input: orders.CreateOrderInput): Promise<ActionResult<{ order: orders.OrderView; existing: boolean }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.orderCreate, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await orders.createOrder(ctx, p.data);
  if (r.ok) revalidatePath('/app/production');
  return toAction(r, r.ok && !r.data.existing ? tr(t.msg.orderCreated, { no: r.data.order.docNo }) : undefined);
}

/** Tahrir: reja miqdori, izoh, haqiqiy sarf (`materials`), ish haqi (`labor` — to'liq ro'yxat) */
export async function updateProductionOrderAction(id: string, input: orders.UpdateOrderInput): Promise<ActionResult<{ order: orders.OrderView }>> {
  const { ctx, s, t } = await prep();
  const idp = orderIdOf(s, id, t.errors.orderNotFound);
  if (!idp.ok) return invalid(idp.error);
  const p = parseInput(s.orderUpdate, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await orders.updateOrder(ctx, idp.data.id, {
    plannedQty: p.data.plannedQty,
    note: p.data.note,
    materials: p.data.materials?.map((m) => ({ id: m.id, productId: m.productId, actualQty: m.actualQty })),
    labor: p.data.labor?.map((l) => ({ operation: l.operation, workerId: l.workerId, qty: l.qty, rate: l.rate })),
  });
  return toAction(r, t.msg.orderUpdated);
}

export async function startProductionOrderAction(id: string): Promise<ActionResult<{ order: orders.OrderView }>> {
  const { ctx, s, t } = await prep();
  const idp = orderIdOf(s, id, t.errors.orderNotFound);
  if (!idp.ok) return invalid(idp.error);
  const r = await orders.startOrder(ctx, idp.data.id);
  if (r.ok) revalidatePath('/app/production');
  return toAction(r, t.msg.orderStarted);
}

/**
 * «Bajarildi»: xom ashyo chiqadi, tayyor mahsulot kirim bo'ladi, tannarx hisoblanadi. Yetmasa —
 * `{ ok: false, code: 'outOfStock', details: { shortages: [{ productId, code, name, unit, need, available }] } }`.
 */
export async function completeProductionOrderAction(id: string, input: orders.CompleteOrderInput): Promise<ActionResult<{ order: orders.OrderView; outputProductId: string | null; createdOutput: boolean }>> {
  const { ctx, s, t } = await prep();
  const idp = orderIdOf(s, id, t.errors.orderNotFound);
  if (!idp.ok) return invalid(idp.error);
  const p = parseInput(s.orderComplete, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await orders.completeOrder(ctx, idp.data.id, {
    producedQty: p.data.producedQty,
    scrapQty: p.data.scrapQty,
    materials: p.data.materials?.map((m) => ({ id: m.id, productId: m.productId, actualQty: m.actualQty })),
    labor: p.data.labor?.map((l) => ({ operation: l.operation, workerId: l.workerId, qty: l.qty, rate: l.rate })),
  });
  if (r.ok) {
    revalidatePath('/app/production');
    revalidatePath('/app/products');
  }
  return toAction(r, r.ok ? tr(t.msg.orderDone, { no: r.data.order.docNo, qty: fmtQty(r.data.order.producedQty ?? 0) }) : undefined);
}

export async function cancelProductionOrderAction(id: string, input: { reason?: string } = {}): Promise<ActionResult<{ order: orders.OrderView }>> {
  const { ctx, s, t } = await prep();
  const idp = orderIdOf(s, id, t.errors.orderNotFound);
  if (!idp.ok) return invalid(idp.error);
  const p = parseInput(s.orderCancel, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await orders.cancelOrder(ctx, idp.data.id, p.data.reason || undefined);
  if (r.ok) revalidatePath('/app/production');
  return toAction(r, t.msg.orderCancelled);
}

/* ───────────────────────────── ishbay ───────────────────────────── */

/** Ishbay yozish (ishchi — o'zi uchun; `piecework.approve` bilan — `workerId` uchun) */
export async function logPieceworkAction(input: piecework.LogInput): Promise<ActionResult<{ entry: piecework.PieceworkView; existing: boolean }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.pieceworkLog, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await piecework.logPiecework(ctx, p.data);
  if (r.ok) revalidatePath('/app/piecework');
  return toAction(r, r.ok && !r.data.existing ? t.msg.entryLogged : undefined);
}

/** «Yozildi» holatidagi yozuvni tuzatish (narx — faqat tasdiqlovchi) */
export async function editPieceworkAction(input: { id: string; qty?: number; rate?: number; operation?: string }): Promise<ActionResult<{ entry: piecework.PieceworkView }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.pieceworkEdit, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await piecework.editPiecework(ctx, { id: p.data.id, qty: p.data.qty, rate: p.data.rate, operation: p.data.operation || undefined });
  if (r.ok) revalidatePath('/app/piecework');
  return toAction(r, t.msg.entryUpdated);
}

export async function approvePieceworkAction(input: { ids: string[] }): Promise<ActionResult<{ updated: number; skipped: number }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.pieceworkIds, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await piecework.approvePiecework(ctx, p.data.ids);
  if (r.ok) revalidatePath('/app/piecework');
  return toAction(r, r.ok ? tr(t.msg.entriesApproved, { n: r.data.updated }) : undefined);
}

export async function rejectPieceworkAction(input: { ids: string[]; reason?: string }): Promise<ActionResult<{ updated: number; skipped: number }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.pieceworkIds, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await piecework.rejectPiecework(ctx, p.data.ids, p.data.reason || undefined);
  if (r.ok) revalidatePath('/app/piecework');
  return toAction(r, r.ok ? tr(t.msg.entriesRejected, { n: r.data.updated }) : undefined);
}

/** To'lash: ishchining tasdiqlangan yozuvlari (`ids` yoki davr) → kassa chiqimi «Ish haqi». `clientId` — takroriy bosishdan */
export async function payPieceworkAction(input: piecework.PayInput): Promise<ActionResult<piecework.PayResult>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.pieceworkPay, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await piecework.payPiecework(ctx, p.data);
  if (r.ok) {
    revalidatePath('/app/piecework');
    revalidatePath('/app/finance');
    revalidatePath('/app/kirim-chiqim');
  }
  return toAction(r, r.ok ? tr(t.msg.paid, { name: r.data.workerName, sum: fmtMoney(r.data.amount) }) : undefined);
}
