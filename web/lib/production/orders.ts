/**
 * Ishlab chiqarish akti (server, DB) — ochish, tahrirlash (haqiqiy sarf), boshlash, «bajarildi», bekor qilish,
 * ro'yxat va ko'rinish. Hujjat: docs/SEX_API.md §5.
 *
 * «Bajarildi» tartibi (hammasi yoki hech biri — tranzaksiyasiz MongoDB uchun kompensatsiya):
 *   1) qulf (`postingAt`, ikki marta bosilsa — `locked`);
 *   2) yetishmovchilik oldindan tekshiriladi — yetmasa `outOfStock` (details.shortages), hech narsa yozilmaydi;
 *   3) xom ashyo `fromBranchId` dan atomik chiqadi (har biri qoldiq sharti bilan); poyga holatida — qaytariladi;
 *   4) tannarx = materiallar (joriy o'rtacha narx × haqiqiy sarf) + ish haqi + ustama;
 *   5) tayyor mahsulot `toBranchId` ga kirim (topilmasa — barqaror kod bo'yicha yaratiladi), o'rtacha tannarx;
 *   6) akt `done`; brak bo'lsa — StockAdjustment (writeoff, production_scrap) hujjati (zarar hisobi).
 */
import type { Types } from 'mongoose';
import type { IProductionLabor, IProductionMaterial, ProductionOrderDoc, ProductionStatus } from '../models/tenant/ProductionOrder';
import type { RecipeDoc } from '../models/tenant/Recipe';
import type { ProductDoc } from '../models/tenant/Product';
import type { ProductUnit } from '../businessTypes';
import { datePrefix, nextDocNo } from '../counters';
import { isValidQty, qtyLabel, roundQty } from '../qty';
import { runWithCompensation } from '../compensate';
import { isDupKey } from '../posSync';
import { logError } from '../logger';
import { tr } from '../i18n/fmt';
import { tashkentDayKey } from '../period';
import { computeProductionCost, isOrderOverdue, lineAmount, planLabor, planMaterials, productionAllows, type ProductionOp } from './calc';
import { consumeStock, ensureItemCode, findStockDoc, GOODS_ONLY, receiveStock, unconsumeStock, codeFilter } from './stock';
import { acquireLock, audit, branchNames, dateRange, oid, pageArgs, releaseLock, resolveAnyBranch, resolveOwnBranch, searchRegex } from './common';
import { canViewProdCost, fail, guard, iso, ok, scoped, validId, type OpErr, type OpResult, type ProductionCtx } from './context';

/* ───────────────────────────── ko'rinish ───────────────────────────── */

export interface OrderView {
  id: string;
  docNo: string;
  status: ProductionStatus;
  recipe: { id: string; name: string; version: number; outputCode: string; outputName: string; outputQty: number; unit: ProductUnit | null };
  plannedQty: number;
  producedQty: number | null;
  scrapQty: number | null;
  fromBranchId: string;
  fromBranchName: string | null;
  toBranchId: string;
  toBranchName: string | null;
  materials: {
    id: string; code: string; productId: string | null; name: string; unit: ProductUnit | null;
    plannedQty: number; actualQty: number; extra: boolean;
    /** Haqiqiy − reja (musbat — ortiqcha sarf) */
    variance: number;
    /** `production.viewCost` bo'lmasa — null */
    unitCost: number | null; cost: number | null;
  }[];
  labor: { id: string; operation: string; workerId: string | null; workerName: string | null; qty: number; rate: number; amount: number }[];
  laborManual: boolean;
  /** `production.viewCost` bo'lmasa — null */
  cost: { materials: number; labor: number; overhead: number; total: number; unitCost: number; scrap: number } | null;
  outputProductId: string | null;
  scrapDocNo: string | null;
  /** Topshirish muddati (YYYY-MM-DD) */
  dueDate: string | null;
  /** Ochiq va muddati (Toshkent kuni bo'yicha) o'tgan */
  overdue: boolean;
  /** Mijoz buyurtmasi */
  customerRef: string | null;
  note: string | null;
  createdBy: string;
  createdAt: string | null;
  startedAt: string | null;
  startedBy: string | null;
  completedAt: string | null;
  completedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  updatedAt: string | null;
  rev: number;
  /** UI tugmalari */
  can: { edit: boolean; start: boolean; complete: boolean; cancel: boolean; viewCost: boolean };
}

/** Kalendar kuni (UTC yarim tunda saqlangan) → YYYY-MM-DD */
const dayOf = (d?: Date | null): string | null => (d ? new Date(d).toISOString().slice(0, 10) : null);

function canModify(ctx: ProductionCtx, o: Pick<ProductionOrderDoc, 'fromBranchId'>): boolean {
  return !scoped(ctx) || String(o.fromBranchId) === ctx.user.branchId;
}

export function orderView(ctx: ProductionCtx, o: ProductionOrderDoc, names: Map<string, string>): OrderView {
  const showCost = canViewProdCost(ctx);
  const manage = ctx.perms.has('production.manage') && canModify(ctx, o);
  const allow = (op: ProductionOp) => manage && productionAllows(o.status, op);
  const s = o.recipeSnapshot;
  return {
    id: String(o._id),
    docNo: o.docNo,
    status: o.status,
    recipe: { id: String(o.recipeId), name: s.name, version: s.version, outputCode: s.outputCode, outputName: s.outputName, outputQty: s.outputQty, unit: s.unit ?? null },
    plannedQty: o.plannedQty,
    producedQty: o.producedQty ?? null,
    scrapQty: o.scrapQty ?? null,
    fromBranchId: String(o.fromBranchId),
    fromBranchName: names.get(String(o.fromBranchId)) ?? null,
    toBranchId: String(o.toBranchId),
    toBranchName: names.get(String(o.toBranchId)) ?? null,
    materials: (o.materials ?? []).map((m) => ({
      id: String(m._id), code: m.code, productId: m.productId ? String(m.productId) : null, name: m.name, unit: m.unit ?? null,
      plannedQty: m.plannedQty, actualQty: m.actualQty, extra: !!m.extra, variance: roundQty(m.actualQty - m.plannedQty),
      unitCost: showCost ? m.unitCost ?? null : null, cost: showCost ? m.cost ?? null : null,
    })),
    labor: (o.labor ?? []).map((l) => ({
      id: String(l._id), operation: l.operation, workerId: l.workerId ? String(l.workerId) : null, workerName: l.workerName ?? null,
      qty: l.qty, rate: l.rate, amount: l.amount,
    })),
    laborManual: !!o.laborManual,
    cost: showCost && o.status === 'done'
      ? { materials: o.materialsCost ?? 0, labor: o.laborCost ?? 0, overhead: o.overheadCost ?? 0, total: o.costTotal ?? 0, unitCost: o.unitCost ?? 0, scrap: o.scrapCost ?? 0 }
      : null,
    outputProductId: o.outputProductId ? String(o.outputProductId) : null,
    scrapDocNo: o.scrapDocNo ?? null,
    dueDate: dayOf(o.dueDate),
    overdue: isOrderOverdue(o.status, o.dueDate, tashkentDayKey(new Date())),
    customerRef: o.customerRef || null,
    note: o.note || null,
    createdBy: o.createdBy,
    createdAt: iso(o.createdAt),
    startedAt: iso(o.startedAt),
    startedBy: o.startedBy ?? null,
    completedAt: iso(o.completedAt),
    completedBy: o.completedBy ?? null,
    cancelledAt: iso(o.cancelledAt),
    cancelledBy: o.cancelledBy ?? null,
    cancelReason: o.cancelReason ?? null,
    updatedAt: iso(o.updatedAt),
    rev: o.rev ?? 0,
    can: { edit: allow('edit'), start: allow('start'), complete: allow('complete'), cancel: allow('cancel'), viewCost: showCost },
  };
}

async function viewOf(ctx: ProductionCtx, o: ProductionOrderDoc): Promise<OrderView> {
  return orderView(ctx, o, await branchNames(ctx, [o.fromBranchId, o.toBranchId]));
}

/** Filial xodimi — xom ashyo yoki tayyor mahsulot ombori o'ziniki bo'lgan aktlar */
function orderScope(ctx: ProductionCtx): Record<string, unknown> {
  if (!scoped(ctx)) return {};
  const b = oid(ctx.user.branchId!);
  return { $or: [{ fromBranchId: b }, { toBranchId: b }] };
}

async function loadOrder(ctx: ProductionCtx, id: string): Promise<OpResult<ProductionOrderDoc>> {
  if (!validId(id)) return fail(ctx.d, 'orderNotFound');
  const o = await ctx.m.ProductionOrder.findOne({ _id: id, ...orderScope(ctx) }).lean<ProductionOrderDoc>();
  return o ? ok(o) : fail(ctx.d, 'orderNotFound');
}

function statusGuard(ctx: ProductionCtx, o: ProductionOrderDoc, op: ProductionOp): OpErr | null {
  if (!canModify(ctx, o)) return fail(ctx.d, 'badBranch');
  return productionAllows(o.status, op) ? null : fail(ctx.d, 'badTransition');
}

/* ───────────────────────────── qatorlar (reja, tahrir) ───────────────────────────── */

/** Texkarta → xom ashyo qatorlari (`fromBranch` dagi hujjat bilan; topilmasa productId yo'q) */
async function buildPlannedMaterials(ctx: ProductionCtx, snap: Pick<RecipeDoc, 'items' | 'outputQty'>, plannedQty: number, branchId: string): Promise<IProductionMaterial[]> {
  const planned = planMaterials(snap.items, plannedQty, snap.outputQty);
  const out: IProductionMaterial[] = [];
  for (const pl of planned) {
    const p = await findStockDoc(ctx.m.Product, pl.code, branchId, { receivable: true });
    out.push({
      code: pl.code, name: p?.name ?? pl.name, unit: (pl.unit ?? undefined) as ProductUnit | undefined,
      plannedQty: pl.plannedQty, actualQty: pl.plannedQty,
      ...(p ? { productId: p._id } : {}),
    });
  }
  return out;
}

export interface MaterialEdit { id?: string; productId?: string; actualQty: number }
export interface LaborEdit { operation: string; workerId?: string; qty: number; rate: number }

/**
 * Haqiqiy sarfni tuzatish: `id` — mavjud qator; `productId` (id'siz) — qo'shimcha qator (shu ombordagi sanaladigan
 * tovar; shu kodli qator bo'lsa — o'sha yangilanadi). 0 — ishlatilmadi.
 */
async function applyMaterialEdits(ctx: ProductionCtx, o: Pick<ProductionOrderDoc, 'fromBranchId' | 'materials'>, edits: readonly MaterialEdit[]): Promise<OpResult<IProductionMaterial[]>> {
  const list = (o.materials ?? []).map((m) => ({ ...m }));
  for (const e of edits) {
    if (e.id) {
      const line = list.find((m) => String(m._id) === e.id);
      if (!line) return fail(ctx.d, 'badInput');
      if (e.actualQty > 0 && !isValidQty(e.actualQty, line.unit)) return fail(ctx.d, 'badQty', { name: line.name });
      line.actualQty = roundQty(e.actualQty);
      continue;
    }
    if (!e.productId) return fail(ctx.d, 'badInput');
    const p = await ctx.m.Product.findOne({ _id: e.productId, branchId: o.fromBranchId, ...GOODS_ONLY, trackQuantity: true }).lean<ProductDoc>();
    if (!p) return fail(ctx.d, 'productNotFound');
    if (e.actualQty > 0 && !isValidQty(e.actualQty, p.unit)) return fail(ctx.d, 'badQty', { name: p.name });
    const code = await ensureItemCode(ctx.m.Product, p);
    const same = list.find((m) => m.code === code);
    if (same) {
      same.actualQty = roundQty(e.actualQty);
      if (!same.productId) same.productId = p._id;
    } else {
      list.push({ code, productId: p._id, name: p.name, unit: p.unit, plannedQty: 0, actualQty: roundQty(e.actualQty), extra: true });
    }
  }
  return ok(list);
}

async function buildLabor(ctx: ProductionCtx, edits: readonly LaborEdit[]): Promise<OpResult<IProductionLabor[]>> {
  const ids = [...new Set(edits.map((l) => l.workerId).filter((x): x is string => !!x))];
  const users = ids.length ? await ctx.m.User.find({ _id: { $in: ids }, active: true }).select('username fullName').lean() : [];
  const byId = new Map(users.map((u) => [String(u._id), u.fullName || u.username]));
  const out: IProductionLabor[] = [];
  for (const l of edits) {
    if (l.workerId && !byId.has(l.workerId)) return fail(ctx.d, 'workerNotFound');
    out.push({
      operation: l.operation, qty: roundQty(l.qty), rate: l.rate, amount: lineAmount(l.rate, l.qty),
      ...(l.workerId ? { workerId: oid(l.workerId), workerName: byId.get(l.workerId) } : {}),
    });
  }
  return ok(out);
}

/* ───────────────────────────── ochish / tahrir ───────────────────────────── */

export interface CreateOrderInput {
  recipeId: string;
  plannedQty: number;
  fromBranchId?: string;
  toBranchId?: string;
  /** Topshirish muddati (kalendar kuni, UTC yarim tun) */
  dueDate?: Date | null;
  customerRef?: string;
  note?: string;
  clientId?: string;
}

/** Akt ochish (`production.manage`): texkarta nusxasi, xom ashyo rejasi (yo'qotish bilan), ish haqi rejasi */
export async function createOrder(ctx: ProductionCtx, input: CreateOrderInput): Promise<OpResult<{ order: OrderView; existing: boolean }>> {
  const denied = guard(ctx, 'production', 'production.manage');
  if (denied) return denied;
  if (input.clientId) {
    const prev = await ctx.m.ProductionOrder.findOne({ clientId: input.clientId, ...orderScope(ctx) }).lean<ProductionOrderDoc>();
    if (prev) return ok({ order: await viewOf(ctx, prev), existing: true });
  }
  if (!validId(input.recipeId)) return fail(ctx.d, 'recipeNotFound');
  const r = await ctx.m.Recipe.findById(input.recipeId).lean<RecipeDoc>();
  if (!r) return fail(ctx.d, 'recipeNotFound');
  if (r.active === false) return fail(ctx.d, 'recipeInactive');
  if (!isValidQty(input.plannedQty, r.unit)) return fail(ctx.d, 'badQty', { name: r.outputName });

  const from = await resolveOwnBranch(ctx, input.fromBranchId);
  if (!from.ok) return from;
  const to = input.toBranchId ? await resolveAnyBranch(ctx, input.toBranchId) : from;
  if (!to.ok) return to;

  const materials = await buildPlannedMaterials(ctx, r, input.plannedQty, from.data);
  const labor = planLabor(r.operations, input.plannedQty);
  const docNo = await nextDocNo(ctx.m.ProductionOrder, 'docNo', 'production', datePrefix('P'));
  try {
    const created = await ctx.m.ProductionOrder.create({
      docNo,
      status: 'draft',
      recipeId: r._id,
      recipeSnapshot: {
        recipeId: r._id, name: r.name, version: r.version, outputCode: r.outputCode, outputName: r.outputName,
        outputQty: r.outputQty, unit: r.unit, items: r.items, operations: r.operations, overheadPerUnit: r.overheadPerUnit ?? 0,
      },
      plannedQty: input.plannedQty,
      fromBranchId: oid(from.data),
      toBranchId: oid(to.data),
      materials,
      labor,
      ...(input.dueDate ? { dueDate: input.dueDate } : {}),
      ...(input.customerRef ? { customerRef: input.customerRef } : {}),
      note: input.note || undefined,
      ...(input.clientId ? { clientId: input.clientId } : {}),
      createdBy: ctx.user.username,
      rev: 0,
    });
    const o = created.toObject() as ProductionOrderDoc;
    await audit(ctx, 'production', 'production.create', String(o._id), `Ishlab chiqarish akti ${docNo}: ${r.outputName} × ${qtyLabel(input.plannedQty, r.unit)} (texkarta v${r.version})`);
    return ok({ order: await viewOf(ctx, o), existing: false });
  } catch (e) {
    if (isDupKey(e) && input.clientId) {
      const prev = await ctx.m.ProductionOrder.findOne({ clientId: input.clientId }).lean<ProductionOrderDoc>();
      if (prev) return ok({ order: await viewOf(ctx, prev), existing: true });
    }
    throw e;
  }
}

export interface UpdateOrderInput {
  plannedQty?: number;
  note?: string;
  /** null — olib tashlash */
  dueDate?: Date | null;
  customerRef?: string;
  materials?: MaterialEdit[];
  labor?: LaborEdit[];
  /** Optimistik qulf: tahrir boshlangandagi `rev` (mos kelmasa — conflict) */
  expectedRev?: number;
}

/**
 * Reja o'zgarganda xom ashyo qatorlari: texkarta bo'yicha yangi reja, lekin mavjud qatorlarning `_id` si saqlanadi
 * (UI dagi haqiqiy sarf tahriri id bilan bog'langan); haqiqiy sarf qo'lda tuzatilgan qator (haqiqiy ≠ eski reja) —
 * o'sha qiymat qoladi, tuzatilmagani — yangi rejaga teng. Qo'shimcha (almashtirish) qatorlari o'zgarmaydi.
 */
function replanMaterials(old: readonly IProductionMaterial[], fresh: readonly IProductionMaterial[]): IProductionMaterial[] {
  const byCode = new Map(old.filter((m) => !m.extra).map((m) => [m.code, m]));
  const planned = fresh.map((f) => {
    const prev = byCode.get(f.code);
    if (!prev) return f;
    const edited = roundQty(prev.actualQty) !== roundQty(prev.plannedQty);
    return {
      ...f,
      ...(prev._id ? { _id: prev._id } : {}),
      ...(edited ? { actualQty: prev.actualQty } : {}),
      ...(!f.productId && prev.productId ? { productId: prev.productId } : {}),
    };
  });
  return [...planned, ...old.filter((m) => m.extra)];
}

/**
 * Tahrir (draft/in_progress): reja miqdori o'zgarsa — texkarta qatorlari rejasi qayta hisoblanadi (`replanMaterials`:
 * qator id'lari va qo'lda tuzatilgan haqiqiy sarf saqlanadi), ish haqi (qo'lda tahrirlanmagan bo'lsa) qayta
 * hisoblanadi; so'ng `materials` (haqiqiy sarf, id bo'yicha) va `labor` (to'liq ro'yxat — qo'lda) qo'llanadi.
 * Optimistik qulf: `expectedRev` (UI yuboradi) va saqlashda `rev` sharti — boshqa birov o'zgartirgan bo'lsa `conflict`.
 */
export async function updateOrder(ctx: ProductionCtx, id: string, input: UpdateOrderInput): Promise<OpResult<{ order: OrderView }>> {
  const denied = guard(ctx, 'production', 'production.manage');
  if (denied) return denied;
  const loaded = await loadOrder(ctx, id);
  if (!loaded.ok) return loaded;
  const o = loaded.data;
  const bad = statusGuard(ctx, o, 'edit');
  if (bad) return bad;
  if (o.postingAt) return fail(ctx.d, 'locked');
  if (input.expectedRev !== undefined && input.expectedRev !== (o.rev ?? 0)) return fail(ctx.d, 'conflict');

  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  let materials = o.materials;
  if (input.plannedQty !== undefined && input.plannedQty !== o.plannedQty) {
    if (!isValidQty(input.plannedQty, o.recipeSnapshot.unit)) return fail(ctx.d, 'badQty', { name: o.recipeSnapshot.outputName });
    const fresh = await buildPlannedMaterials(ctx, o.recipeSnapshot, input.plannedQty, String(o.fromBranchId));
    materials = replanMaterials(o.materials ?? [], fresh);
    set.plannedQty = input.plannedQty;
    if (!o.laborManual && !input.labor) set.labor = planLabor(o.recipeSnapshot.operations, input.plannedQty);
  }
  if (input.materials?.length) {
    const applied = await applyMaterialEdits(ctx, { fromBranchId: o.fromBranchId, materials }, input.materials);
    if (!applied.ok) return applied;
    materials = applied.data;
  }
  if (materials !== o.materials) set.materials = materials;
  if (input.labor) {
    const labor = await buildLabor(ctx, input.labor);
    if (!labor.ok) return labor;
    set.labor = labor.data;
    set.laborManual = true;
  }
  if (input.note !== undefined) {
    if (input.note) set.note = input.note;
    else if (o.note) unset.note = 1;
  }
  if (input.dueDate !== undefined) {
    const cur = dayOf(o.dueDate);
    const next = dayOf(input.dueDate);
    if (next !== cur) {
      if (input.dueDate) set.dueDate = input.dueDate;
      else unset.dueDate = 1;
    }
  }
  if (input.customerRef !== undefined && input.customerRef !== (o.customerRef ?? '')) {
    if (input.customerRef) set.customerRef = input.customerRef;
    else unset.customerRef = 1;
  }
  if (!Object.keys(set).length && !Object.keys(unset).length) return ok({ order: await viewOf(ctx, o) });

  const saved = await ctx.m.ProductionOrder.findOneAndUpdate(
    { _id: o._id, rev: o.rev ?? 0, status: o.status, postingAt: { $exists: false } },
    { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}), $inc: { rev: 1 } },
    { new: true },
  ).lean<ProductionOrderDoc>();
  if (!saved) return fail(ctx.d, 'conflict');
  await audit(ctx, 'production', 'production.update', id, `Akt ${o.docNo} tahrirlandi`, { fields: [...Object.keys(set), ...Object.keys(unset)] });
  return ok({ order: await viewOf(ctx, saved) });
}

/** draft → in_progress */
export async function startOrder(ctx: ProductionCtx, id: string): Promise<OpResult<{ order: OrderView }>> {
  const denied = guard(ctx, 'production', 'production.manage');
  if (denied) return denied;
  const loaded = await loadOrder(ctx, id);
  if (!loaded.ok) return loaded;
  const o = loaded.data;
  const bad = statusGuard(ctx, o, 'start');
  if (bad) return bad;
  const saved = await ctx.m.ProductionOrder.findOneAndUpdate(
    { _id: o._id, status: 'draft', rev: o.rev ?? 0 },
    { $set: { status: 'in_progress', startedAt: new Date(), startedBy: ctx.user.username }, $inc: { rev: 1 } },
    { new: true },
  ).lean<ProductionOrderDoc>();
  if (!saved) return fail(ctx.d, 'conflict');
  await audit(ctx, 'production', 'production.start', id, `Akt ${o.docNo}: ishlab chiqarish boshlandi`);
  return ok({ order: await viewOf(ctx, saved) });
}

/** draft/in_progress → cancelled (ombor o'zgarmaydi — hali hech narsa chiqmagan) */
export async function cancelOrder(ctx: ProductionCtx, id: string, reason?: string): Promise<OpResult<{ order: OrderView }>> {
  const denied = guard(ctx, 'production', 'production.manage');
  if (denied) return denied;
  const loaded = await loadOrder(ctx, id);
  if (!loaded.ok) return loaded;
  const o = loaded.data;
  const bad = statusGuard(ctx, o, 'cancel');
  if (bad) return bad;
  const saved = await ctx.m.ProductionOrder.findOneAndUpdate(
    { _id: o._id, status: o.status, rev: o.rev ?? 0, postingAt: { $exists: false } },
    { $set: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: ctx.user.username, ...(reason ? { cancelReason: reason } : {}) }, $inc: { rev: 1 } },
    { new: true },
  ).lean<ProductionOrderDoc>();
  if (!saved) return fail(ctx.d, o.postingAt ? 'locked' : 'conflict');
  await audit(ctx, 'production', 'production.cancel', id, `Akt ${o.docNo} bekor qilindi${reason ? `: ${reason}` : ''}`);
  return ok({ order: await viewOf(ctx, saved) });
}

/* ───────────────────────────── «bajarildi» ───────────────────────────── */

export interface CompleteOrderInput {
  producedQty: number;
  scrapQty?: number;
  materials?: MaterialEdit[];
  labor?: LaborEdit[];
  /** Optimistik qulf (ko'rilgan `rev`); berilsa va mos kelmasa — conflict (haqiqiy sarf tahriri eskirgan aktga tushmasin) */
  expectedRev?: number;
}

export interface Shortage { productId: string | null; code: string; name: string; unit: ProductUnit | null; need: number; available: number }

/**
 * «Bajarildi»: xom ashyo chiqadi, tayyor mahsulot kirim bo'ladi, tannarx hisoblanadi (yuqoridagi tartib).
 * Natija: yangilangan akt + qisqa yakun (kirim bo'lgan hujjat, tannarx — huquq bo'lsa).
 */
export async function completeOrder(ctx: ProductionCtx, id: string, input: CompleteOrderInput): Promise<OpResult<{ order: OrderView; outputProductId: string | null; createdOutput: boolean }>> {
  const denied = guard(ctx, 'production', 'production.manage');
  if (denied) return denied;
  const loaded = await loadOrder(ctx, id);
  if (!loaded.ok) return loaded;
  const o = loaded.data;
  const bad = statusGuard(ctx, o, 'complete');
  if (bad) return bad;
  if (input.expectedRev !== undefined && input.expectedRev !== (o.rev ?? 0)) return fail(ctx.d, o.postingAt ? 'locked' : 'conflict');
  const snap = o.recipeSnapshot;
  const produced = roundQty(input.producedQty);
  const scrap = roundQty(input.scrapQty ?? 0);
  if (!(produced + scrap > 0)) return fail(ctx.d, 'producedRequired');
  if ((produced > 0 && !isValidQty(produced, snap.unit)) || (scrap > 0 && !isValidQty(scrap, snap.unit))) {
    return fail(ctx.d, 'badQty', { name: snap.outputName });
  }

  // Yakuniy qatorlar (xotirada): haqiqiy sarf va ish haqi
  let materials = o.materials ?? [];
  if (input.materials?.length) {
    const applied = await applyMaterialEdits(ctx, o, input.materials);
    if (!applied.ok) return applied;
    materials = applied.data;
  }
  let labor: IProductionLabor[];
  if (input.labor) {
    const built = await buildLabor(ctx, input.labor);
    if (!built.ok) return built;
    labor = built.data;
  } else if (o.laborManual) {
    labor = o.labor ?? [];
  } else {
    labor = planLabor(snap.operations, produced);
  }

  // Xom ashyo hujjatlari (akt ochilganda topilmagan bo'lsa — hozir kod bo'yicha)
  const used = materials.filter((m) => m.actualQty > 0);
  for (const m of used) {
    if (m.productId) continue;
    const p = await findStockDoc(ctx.m.Product, m.code, o.fromBranchId, { receivable: true });
    if (!p) return fail(ctx.d, 'materialMissing', { name: m.name });
    m.productId = p._id;
  }

  // Oldindan tekshiruv: hammasi yetadimi (aniq ro'yxat bilan; yozuv yo'q)
  const docs = await ctx.m.Product.find({ _id: { $in: used.map((m) => m.productId!) } }).lean<ProductDoc[]>();
  const byId = new Map(docs.map((p) => [String(p._id), p]));
  const shortages: Shortage[] = [];
  for (const m of used) {
    const p = byId.get(String(m.productId));
    const available = p && p.status === 'in_stock' && String(p.branchId) === String(o.fromBranchId)
      ? Math.max(0, roundQty((p.quantity ?? 0) - (p.soldQuantity ?? 0)))
      : 0;
    if (available < m.actualQty) {
      shortages.push({ productId: m.productId ? String(m.productId) : null, code: m.code, name: m.name, unit: m.unit ?? null, need: m.actualQty, available });
    }
  }
  if (shortages.length) return outOfStock(ctx, shortages);

  // Qulf — shu paytdan boshlab boshqa «bajarildi»/tahrir/bekor kutadi
  const lock = await acquireLock(ctx, ctx.m.ProductionOrder, o, ['draft', 'in_progress']);
  if (!lock.ok) return lock;
  const lockAt = lock.data;
  const now = new Date();
  const histDetail = (m: IProductionMaterial) => `${o.docNo} · ${qtyLabel(m.actualQty, m.unit)}`;

  // Xom ashyo — atomik chiqim (hammasi yoki hech biri)
  const costs = new Map<string, number>();
  const consumed = await runWithCompensation(used, async (m) => {
    const before = await consumeStock(ctx.m.Product, m.productId!, o.fromBranchId, m.actualQty, {
      action: 'consumed', detail: histDetail(m), by: ctx.user.username, at: now,
    });
    if (!before) return null;
    costs.set(String(m._id ?? m.code), before.purchasePrice ?? 0);
    return { result: m, undo: () => unconsumeStock(ctx.m.Product, m.productId!, m.actualQty) };
  });
  if (!consumed.ok) {
    await releaseLock(ctx.m.ProductionOrder, o._id, lockAt);
    if (consumed.error) logError('production consume failed', consumed.error, { dbName: ctx.user.dbName });
    const m = used[consumed.failedIndex];
    const p = await ctx.m.Product.findById(m.productId).lean<ProductDoc>();
    return outOfStock(ctx, [{
      productId: String(m.productId), code: m.code, name: m.name, unit: m.unit ?? null, need: m.actualQty,
      available: p ? Math.max(0, roundQty((p.quantity ?? 0) - (p.soldQuantity ?? 0))) : 0,
    }]);
  }
  const undoMaterials = async () => {
    for (const m of [...used].reverse()) await unconsumeStock(ctx.m.Product, m.productId!, m.actualQty).catch((e) => logError('production undo consume', e));
  };

  // Tannarx
  const finalMaterials: IProductionMaterial[] = materials.map((m) => {
    const unitCost = costs.get(String(m._id ?? m.code));
    if (unitCost === undefined) return { ...m };
    return { ...m, unitCost, cost: lineAmount(unitCost, m.actualQty) };
  });
  const cost = computeProductionCost({
    materials: finalMaterials.filter((m) => m.actualQty > 0).map((m) => ({ qty: m.actualQty, unitCost: m.unitCost ?? 0 })),
    labor,
    overheadPerUnit: snap.overheadPerUnit ?? 0,
    producedQty: produced,
    scrapQty: scrap,
  });
  const exactUnitCost = produced + scrap > 0 ? cost.costTotal / (produced + scrap) : 0;

  // Tayyor mahsulot shabloni: avval tayyor mahsulot omborida, bo'lmasa istalgan filialdagi shu kodli hujjat
  const template = (await findStockDoc(ctx.m.Product, snap.outputCode, o.toBranchId, { receivable: true }))
    ?? (await ctx.m.Product.findOne({ ...codeFilter(snap.outputCode), ...GOODS_ONLY }).sort({ createdAt: 1 }).lean<ProductDoc>());
  if (!template) {
    await undoMaterials();
    await releaseLock(ctx.m.ProductionOrder, o._id, lockAt);
    return fail(ctx.d, 'outputNotFound');
  }

  let outputId: Types.ObjectId | null = null;
  let createdOutput = false;
  let undoOutput: (() => Promise<void>) | null = null;
  if (produced > 0) {
    const rec = await receiveStock(ctx.m.Product, {
      branchId: o.toBranchId, template, code: snap.outputCode, qty: produced, unitCost: exactUnitCost,
      history: { action: 'produced', detail: `${o.docNo} · +${qtyLabel(produced, snap.unit)}`, by: ctx.user.username, at: now },
      by: ctx.user.username,
    });
    if (!rec.ok) {
      await undoMaterials();
      await releaseLock(ctx.m.ProductionOrder, o._id, lockAt);
      return rec.reason === 'conflict' ? fail(ctx.d, 'conflict') : fail(ctx.d, rec.reason, { name: rec.name });
    }
    outputId = rec.productId;
    createdOutput = rec.created;
    undoOutput = rec.undo;
  }

  const saved = await ctx.m.ProductionOrder.findOneAndUpdate(
    { _id: o._id, postingAt: lockAt },
    {
      $set: {
        status: 'done', producedQty: produced, scrapQty: scrap, materials: finalMaterials, labor,
        materialsCost: cost.materialsCost, laborCost: cost.laborCost, overheadCost: cost.overheadCost,
        costTotal: cost.costTotal, unitCost: cost.unitCost, scrapCost: cost.scrapCost,
        completedAt: now, completedBy: ctx.user.username,
        ...(outputId ? { outputProductId: outputId } : {}),
        ...(o.status === 'draft' ? { startedAt: now, startedBy: ctx.user.username } : {}),
      },
      $unset: { postingAt: 1 },
      $inc: { rev: 1 },
    },
    { new: true },
  ).lean<ProductionOrderDoc>();
  if (!saved) {
    if (undoOutput) await undoOutput().catch((e) => logError('production undo output', e));
    await undoMaterials();
    await releaseLock(ctx.m.ProductionOrder, o._id, lockAt);
    return fail(ctx.d, 'conflict');
  }

  // Brak — zarar hujjati (ombor o'zgarmaydi: brak omborga kirmagan). Xato asosiy natijani buzmaydi
  let final = saved;
  if (scrap > 0) {
    try {
      const scrapDocNo = await nextDocNo(ctx.m.StockAdjustment, 'docNo', 'stockadj', 'HC');
      await ctx.m.StockAdjustment.create({
        docNo: scrapDocNo, type: 'writeoff', reason: 'production_scrap', note: tr(ctx.d.production.auto.scrapNote, { no: o.docNo }),
        items: [{ productId: outputId ?? template._id, name: snap.outputName, qty: scrap, purchasePrice: cost.unitCost }],
        totalCost: cost.scrapCost, by: ctx.user.username, branchId: o.toBranchId,
      });
      final = (await ctx.m.ProductionOrder.findOneAndUpdate({ _id: o._id }, { $set: { scrapDocNo } }, { new: true }).lean<ProductionOrderDoc>()) ?? saved;
    } catch (e) {
      logError('production scrap doc failed', e, { dbName: ctx.user.dbName, docNo: o.docNo });
    }
  }

  await audit(ctx, 'production', 'production.done', id,
    `Akt ${o.docNo} bajarildi: ${snap.outputName} +${qtyLabel(produced, snap.unit)}${scrap > 0 ? `, brak ${qtyLabel(scrap, snap.unit)}` : ''}; xom ashyo ${used.length} ta; tannarx ${cost.unitCost} so'm/birlik`,
    { produced, scrap, costTotal: cost.costTotal, unitCost: cost.unitCost, materials: used.map((m) => ({ code: m.code, qty: m.actualQty })) });
  return ok({ order: await viewOf(ctx, final), outputProductId: outputId ? String(outputId) : null, createdOutput });
}

function outOfStock(ctx: ProductionCtx, shortages: Shortage[]): OpErr {
  const list = shortages.slice(0, 5).map((s) => `${s.name} (${qtyLabel(s.need, s.unit)} / ${qtyLabel(s.available, s.unit)})`).join(', ');
  return fail(ctx.d, 'outOfStock', { list }, { shortages });
}

/* ───────────────────────────── o'qish ───────────────────────────── */

const READ_PERMS = ['production.view', 'production.manage'] as const;

export interface OrderSummary {
  id: string;
  docNo: string;
  status: ProductionStatus;
  recipeName: string;
  outputName: string;
  unit: ProductUnit | null;
  plannedQty: number;
  producedQty: number | null;
  scrapQty: number | null;
  fromBranchName: string | null;
  toBranchName: string | null;
  createdBy: string;
  createdAt: string | null;
  completedAt: string | null;
  /** Topshirish muddati (YYYY-MM-DD), mijoz buyurtmasi, izoh */
  dueDate: string | null;
  overdue: boolean;
  customerRef: string | null;
  note: string | null;
  /** `production.viewCost` bo'lmasa — null */
  costTotal: number | null;
  unitCost: number | null;
  /** Texkarta operatsiyalari (ishchi ishbay yozganda tanlash uchun) */
  operations: { name: string; rate: number }[];
}

const SUMMARY_FIELDS = 'docNo status recipeSnapshot plannedQty producedQty scrapQty fromBranchId toBranchId createdBy createdAt completedAt costTotal unitCost dueDate customerRef note';
const ACTIVE = ['draft', 'in_progress'] as const;
/** Muddatsiz aktlar «muddat bo'yicha» saralashda oxirida */
const NO_DUE = new Date('9999-12-31T00:00:00.000Z');

/**
 * Aktlar ro'yxati. `sort: 'due'` — muddat bo'yicha (yaqini birinchi, muddatsizlar oxirida); `due: 'overdue'` — ochiq
 * va muddati o'tganlar. Javobda `overdue` — doiradagi muddati o'tgan ochiq aktlar soni (filtrdan qat'i nazar).
 */
export async function listOrders(
  ctx: ProductionCtx,
  q: { status?: string; branchId?: string; recipeId?: string; from?: Date; to?: Date; q?: string; page?: number; limit?: number; sort?: 'due'; due?: 'overdue' } = {},
): Promise<OpResult<{ items: OrderSummary[]; total: number; page: number; limit: number; overdue: number }>> {
  const denied = guard(ctx, 'production', READ_PERMS);
  if (denied) return denied;
  const filter: Record<string, unknown> = { ...orderScope(ctx) };
  if (q.status === 'active') filter.status = { $in: [...ACTIVE] };
  else if (q.status && ['draft', 'in_progress', 'done', 'cancelled'].includes(q.status)) filter.status = q.status;
  const todayKey = tashkentDayKey(new Date());
  const overdueCond = { status: { $in: [...ACTIVE] }, dueDate: { $lt: new Date(`${todayKey}T00:00:00.000Z`) } };
  if (q.due === 'overdue') {
    const cur = filter.status;
    filter.status = typeof cur === 'string' ? ((ACTIVE as readonly string[]).includes(cur) ? cur : { $in: [] }) : overdueCond.status;
    filter.dueDate = overdueCond.dueDate;
  }
  if (q.branchId && validId(q.branchId)) filter.$and = [{ $or: [{ fromBranchId: oid(q.branchId) }, { toBranchId: oid(q.branchId) }] }];
  if (q.recipeId && validId(q.recipeId)) filter.recipeId = oid(q.recipeId);
  const range = dateRange(q.from, q.to);
  if (range) filter.createdAt = range;
  const rx = searchRegex(q.q);
  if (rx) filter.$and = [...((filter.$and as unknown[]) ?? []), { $or: [{ docNo: rx }, { 'recipeSnapshot.outputName': rx }, { 'recipeSnapshot.name': rx }] }];
  const { skip, limit, page } = pageArgs(q);
  const project = Object.fromEntries(SUMMARY_FIELDS.split(' ').map((k) => [k, 1]));
  const [list, total, overdue] = await Promise.all([
    q.sort === 'due'
      ? ctx.m.ProductionOrder.aggregate<ProductionOrderDoc>([
          { $match: filter },
          { $addFields: { dueSort: { $ifNull: ['$dueDate', NO_DUE] } } },
          { $sort: { dueSort: 1, createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
          { $project: project },
        ])
      : ctx.m.ProductionOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select(SUMMARY_FIELDS).lean<ProductionOrderDoc[]>(),
    ctx.m.ProductionOrder.countDocuments(filter),
    ctx.m.ProductionOrder.countDocuments({ ...orderScope(ctx), ...overdueCond }),
  ]);
  const names = await branchNames(ctx, list.flatMap((o) => [o.fromBranchId, o.toBranchId]));
  const showCost = canViewProdCost(ctx);
  return ok({
    items: list.map((o) => ({
      id: String(o._id), docNo: o.docNo, status: o.status, recipeName: o.recipeSnapshot.name, outputName: o.recipeSnapshot.outputName,
      unit: o.recipeSnapshot.unit ?? null, plannedQty: o.plannedQty, producedQty: o.producedQty ?? null, scrapQty: o.scrapQty ?? null,
      fromBranchName: names.get(String(o.fromBranchId)) ?? null, toBranchName: names.get(String(o.toBranchId)) ?? null,
      createdBy: o.createdBy, createdAt: iso(o.createdAt), completedAt: iso(o.completedAt),
      dueDate: dayOf(o.dueDate), overdue: isOrderOverdue(o.status, o.dueDate, todayKey), customerRef: o.customerRef || null, note: o.note || null,
      costTotal: showCost ? o.costTotal ?? null : null, unitCost: showCost ? o.unitCost ?? null : null,
      operations: (o.recipeSnapshot.operations ?? []).map((op) => ({ name: op.name, rate: op.rate ?? 0 })),
    })),
    total, page, limit, overdue,
  });
}

export async function getOrder(ctx: ProductionCtx, id: string): Promise<OpResult<{ order: OrderView }>> {
  const denied = guard(ctx, 'production', READ_PERMS);
  if (denied) return denied;
  const loaded = await loadOrder(ctx, id);
  if (!loaded.ok) return loaded;
  return ok({ order: await viewOf(ctx, loaded.data) });
}
