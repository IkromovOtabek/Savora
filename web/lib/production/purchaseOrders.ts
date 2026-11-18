/**
 * Yetkazib beruvchiga buyurtma (xarid, PO) — server, DB. Hujjat: docs/SEX_API.md §7.
 * draft → sent (yuborildi) → partial/received (kirim akti post qilinganda) ; draft/sent/partial → cancelled.
 * Qabul: receipts.ts → receiptDraftFromPo (qolgan miqdorlar bilan kirim qoralamasi) → postReceipt.
 */
import type { IPoLine, PoStatus, PurchaseOrderDoc } from '../models/tenant/PurchaseOrder';
import type { ProductUnit } from '../businessTypes';
import { datePrefix, nextDocNo } from '../counters';
import { isDupKey } from '../posSync';
import { fmtMoney } from '../format';
import { poAllows, poRemaining } from './calc';
import { prepareDocLines, type DocLineInput } from './receipts';
import { audit, branchNames, dateRange, oid, pageArgs, resolveOwnBranch, searchRegex } from './common';
import { canViewPrices, fail, guard, iso, ok, scoped, validId, type OpResult, type ProductionCtx } from './context';

export interface PoView {
  id: string;
  docNo: string;
  status: PoStatus;
  supplierId: string;
  supplierName: string;
  branchId: string;
  branchName: string | null;
  lines: {
    id: string; productId: string; code: string; name: string; qty: number; unit: ProductUnit | null; factor: number;
    baseUnit: ProductUnit | null; price: number | null; amount: number | null; receivedQty: number; remaining: number;
  }[];
  /** `product.viewCost` bo'lmasa — null */
  total: number | null;
  expectedAt: string | null;
  note: string | null;
  createdBy: string;
  createdAt: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string | null;
  rev: number;
  can: { edit: boolean; send: boolean; receive: boolean; cancel: boolean; viewPrices: boolean };
}

function poView(ctx: ProductionCtx, p: PurchaseOrderDoc, names: Map<string, string>): PoView {
  const prices = canViewPrices(ctx);
  const own = !scoped(ctx) || String(p.branchId) === ctx.user.branchId;
  const manage = ctx.perms.has('po.manage') && own;
  return {
    id: String(p._id),
    docNo: p.docNo,
    status: p.status,
    supplierId: String(p.supplierId),
    supplierName: p.supplierName,
    branchId: String(p.branchId),
    branchName: names.get(String(p.branchId)) ?? null,
    lines: (p.lines ?? []).map((l) => ({
      id: String(l._id), productId: String(l.productId), code: l.code, name: l.name, qty: l.qty, unit: l.unit ?? null,
      factor: l.factor ?? 1, baseUnit: l.baseUnit ?? null, price: prices ? l.price ?? null : null, amount: prices ? l.amount ?? null : null,
      receivedQty: l.receivedQty ?? 0, remaining: poRemaining({ qty: l.qty, receivedQty: l.receivedQty ?? 0 }),
    })),
    total: prices ? p.total ?? 0 : null,
    expectedAt: iso(p.expectedAt),
    note: p.note || null,
    createdBy: p.createdBy,
    createdAt: iso(p.createdAt),
    sentAt: iso(p.sentAt),
    receivedAt: iso(p.receivedAt),
    cancelledAt: iso(p.cancelledAt),
    updatedAt: iso(p.updatedAt),
    rev: p.rev ?? 0,
    can: {
      edit: manage && poAllows(p.status, 'edit'),
      send: manage && poAllows(p.status, 'send'),
      receive: ctx.perms.has('receipt.create') && own && poAllows(p.status, 'receive'),
      cancel: manage && poAllows(p.status, 'cancel'),
      viewPrices: prices,
    },
  };
}

async function viewOf(ctx: ProductionCtx, p: PurchaseOrderDoc): Promise<PoView> {
  return poView(ctx, p, await branchNames(ctx, [p.branchId]));
}

const poScope = (ctx: ProductionCtx) => (scoped(ctx) ? { branchId: oid(ctx.user.branchId!) } : {});

async function loadPo(ctx: ProductionCtx, id: string): Promise<OpResult<PurchaseOrderDoc>> {
  if (!validId(id)) return fail(ctx.d, 'poNotFound');
  const p = await ctx.m.PurchaseOrder.findOne({ _id: id, ...poScope(ctx) }).lean<PurchaseOrderDoc>();
  return p ? ok(p) : fail(ctx.d, 'poNotFound');
}

export interface PoInput {
  supplierId: string;
  branchId?: string;
  expectedAt?: Date;
  note?: string;
  lines: DocLineInput[];
  clientId?: string;
}

/** Yaratish (`id` yo'q) yoki tahrirlash (draft/sent — hali qabul bo'lmagan) */
export async function savePo(ctx: ProductionCtx, id: string | null, input: PoInput): Promise<OpResult<{ po: PoView; existing: boolean }>> {
  const denied = guard(ctx, 'purchasing', 'po.manage');
  if (denied) return denied;
  let cur: PurchaseOrderDoc | null = null;
  if (id) {
    const loaded = await loadPo(ctx, id);
    if (!loaded.ok) return loaded;
    cur = loaded.data;
    if (!poAllows(cur.status, 'edit') || (cur.lines ?? []).some((l) => (l.receivedQty ?? 0) > 0)) return fail(ctx.d, 'badTransition');
  } else if (input.clientId) {
    const prev = await ctx.m.PurchaseOrder.findOne({ clientId: input.clientId, ...poScope(ctx) }).lean<PurchaseOrderDoc>();
    if (prev) return ok({ po: await viewOf(ctx, prev), existing: true });
  }
  const supplier = await ctx.m.Supplier.findById(input.supplierId).select('name').lean();
  if (!supplier) return fail(ctx.d, 'supplierNotFound');
  const branch = await resolveOwnBranch(ctx, input.branchId ?? (cur ? String(cur.branchId) : undefined));
  if (!branch.ok) return branch;

  const prepared = await prepareDocLines(ctx, input.lines, (productId, _code, unit) => {
    const old = cur?.lines.find((l) => String(l.productId) === productId && (l.unit ?? undefined) === unit);
    return old?.price ?? undefined;
  });
  if (!prepared.ok) return prepared;
  // Tahrirda mavjud qatorlarning `_id` si saqlanadi (tovar + birlik bo'yicha): ochiq kirim qoralamasidagi `poLineId`
  // bog'lanishi uzilmasin. Yangi qator — yangi id.
  const reuse = new Map((cur?.lines ?? []).map((l) => [`${String(l.productId)}|${l.unit ?? ''}`, l]));
  const lines: IPoLine[] = prepared.data.map((l) => {
    const key = `${String(l.productId)}|${l.unit ?? ''}`;
    const old = reuse.get(key);
    if (old) reuse.delete(key);
    return {
      ...(old?._id ? { _id: old._id } : {}),
      productId: l.productId, code: l.code, name: l.name, qty: l.qty, unit: l.unit, factor: l.factor, baseUnit: l.baseUnit,
      ...(l.price !== undefined ? { price: l.price, amount: l.amount } : {}),
      receivedQty: 0,
    };
  });
  const total = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const fields = {
    supplierId: supplier._id, supplierName: supplier.name, branchId: oid(branch.data), lines, total,
    expectedAt: input.expectedAt, note: input.note || undefined,
  };

  if (cur) {
    const set = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    const unset: Record<string, 1> = {};
    if (!input.expectedAt) unset.expectedAt = 1;
    if (!input.note) unset.note = 1;
    const saved = await ctx.m.PurchaseOrder.findOneAndUpdate(
      { _id: cur._id, rev: cur.rev ?? 0, status: cur.status },
      { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}), $inc: { rev: 1 } },
      { new: true },
    ).lean<PurchaseOrderDoc>();
    if (!saved) return fail(ctx.d, 'conflict');
    await audit(ctx, 'purchase', 'po.update', String(cur._id), `Xarid ${cur.docNo} tahrirlandi (${lines.length} qator)`);
    return ok({ po: await viewOf(ctx, saved), existing: false });
  }

  const docNo = await nextDocNo(ctx.m.PurchaseOrder, 'docNo', 'purchase', datePrefix('Z'));
  try {
    const created = await ctx.m.PurchaseOrder.create({
      docNo, status: 'draft', ...fields, ...(input.clientId ? { clientId: input.clientId } : {}), createdBy: ctx.user.username, rev: 0,
    });
    const p = created.toObject() as PurchaseOrderDoc;
    await audit(ctx, 'purchase', 'po.create', String(p._id), `Xarid ${docNo}: ${supplier.name}, ${lines.length} qator${total ? `, ${fmtMoney(total)} so'm` : ''}`);
    return ok({ po: await viewOf(ctx, p), existing: false });
  } catch (e) {
    if (isDupKey(e) && input.clientId) {
      const prev = await ctx.m.PurchaseOrder.findOne({ clientId: input.clientId }).lean<PurchaseOrderDoc>();
      if (prev) return ok({ po: await viewOf(ctx, prev), existing: true });
    }
    throw e;
  }
}

async function transition(ctx: ProductionCtx, id: string, op: 'send' | 'cancel'): Promise<OpResult<{ po: PoView }>> {
  const denied = guard(ctx, 'purchasing', 'po.manage');
  if (denied) return denied;
  const loaded = await loadPo(ctx, id);
  if (!loaded.ok) return loaded;
  const p = loaded.data;
  if (!poAllows(p.status, op)) return fail(ctx.d, 'badTransition');
  const now = new Date();
  const set = op === 'send'
    ? { status: 'sent', sentAt: now, sentBy: ctx.user.username }
    : { status: 'cancelled', cancelledAt: now, cancelledBy: ctx.user.username };
  const saved = await ctx.m.PurchaseOrder.findOneAndUpdate({ _id: p._id, status: p.status }, { $set: set, $inc: { rev: 1 } }, { new: true }).lean<PurchaseOrderDoc>();
  if (!saved) return fail(ctx.d, 'conflict');
  await audit(ctx, 'purchase', `po.${op}`, id, `Xarid ${p.docNo}: ${op === 'send' ? 'yuborildi' : 'bekor qilindi'}`);
  return ok({ po: await viewOf(ctx, saved) });
}

/** draft → sent (yetkazib beruvchiga yuborildi deb belgilash; xabar yuborilmaydi) */
export const sendPo = (ctx: ProductionCtx, id: string) => transition(ctx, id, 'send');
/** draft/sent/partial → cancelled (qisman qabuldan keyin — qolgani yopiladi) */
export const cancelPo = (ctx: ProductionCtx, id: string) => transition(ctx, id, 'cancel');

const READ_PERMS = ['po.manage', 'receipt.create', 'suppliers.view'] as const;

export interface PoSummary {
  id: string;
  docNo: string;
  status: PoStatus;
  supplierName: string;
  branchName: string | null;
  lines: number;
  total: number | null;
  expectedAt: string | null;
  createdAt: string | null;
  /** Qabul qilinmagan qatorlar soni */
  open: number;
}

export async function listPos(
  ctx: ProductionCtx,
  q: { status?: string; branchId?: string; supplierId?: string; from?: Date; to?: Date; q?: string; page?: number; limit?: number } = {},
): Promise<OpResult<{ items: PoSummary[]; total: number; page: number; limit: number }>> {
  const denied = guard(ctx, 'purchasing', READ_PERMS);
  if (denied) return denied;
  const filter: Record<string, unknown> = { ...poScope(ctx) };
  if (q.status === 'open') filter.status = { $in: ['draft', 'sent', 'partial'] };
  else if (q.status && ['draft', 'sent', 'partial', 'received', 'cancelled'].includes(q.status)) filter.status = q.status;
  if (q.branchId && validId(q.branchId) && !scoped(ctx)) filter.branchId = oid(q.branchId);
  if (q.supplierId && validId(q.supplierId)) filter.supplierId = oid(q.supplierId);
  const range = dateRange(q.from, q.to);
  if (range) filter.createdAt = range;
  const rx = searchRegex(q.q);
  if (rx) filter.$or = [{ docNo: rx }, { supplierName: rx }, { 'lines.name': rx }];
  const { skip, limit, page } = pageArgs(q);
  const [list, total] = await Promise.all([
    ctx.m.PurchaseOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean<PurchaseOrderDoc[]>(),
    ctx.m.PurchaseOrder.countDocuments(filter),
  ]);
  const names = await branchNames(ctx, list.map((p) => p.branchId));
  const prices = canViewPrices(ctx);
  return ok({
    items: list.map((p) => ({
      id: String(p._id), docNo: p.docNo, status: p.status, supplierName: p.supplierName, branchName: names.get(String(p.branchId)) ?? null,
      lines: p.lines?.length ?? 0, total: prices ? p.total ?? 0 : null, expectedAt: iso(p.expectedAt), createdAt: iso(p.createdAt),
      open: (p.lines ?? []).filter((l) => poRemaining({ qty: l.qty, receivedQty: l.receivedQty ?? 0 }) > 0).length,
    })),
    total, page, limit,
  });
}

export async function getPo(ctx: ProductionCtx, id: string): Promise<OpResult<{ po: PoView }>> {
  const denied = guard(ctx, 'purchasing', READ_PERMS);
  if (denied) return denied;
  const loaded = await loadPo(ctx, id);
  if (!loaded.ok) return loaded;
  return ok({ po: await viewOf(ctx, loaded.data) });
}
