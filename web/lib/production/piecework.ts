/**
 * Ishbay haq (server, DB) — yozish, tahrir, tasdiqlash/rad etish, to'lash (kassa chiqimi), ro'yxat va jamlama.
 * Hujjat: docs/SEX_API.md §8.
 *
 *  - `piecework.log`: ishchi FAQAT O'ZI uchun yozadi va faqat o'z yozuvlarini ko'radi.
 *  - `piecework.approve`: hammaning yozuvlari (filial boshlig'i — o'z filiali), boshqa ishchi uchun yozish,
 *    tasdiqlash/rad etish, narxni tuzatish, to'lash.
 *  - Narx: aktga bog'langan bo'lsa — texkarta operatsiyasi narxi (serverda, ishchi o'zgartira olmaydi);
 *    aks holda kiritilgani (tasdiqlashda boshliq tuzatadi).
 *  - To'lov: tasdiqlangan yozuvlar → `paid` + bitta CashFlow chiqimi («Ish haqi» toifasi). Takroriy bosish — `clientId`.
 */
import { randomUUID } from 'node:crypto';
import type { Types } from 'mongoose';
import type { PieceworkEntryDoc, PieceworkStatus } from '../models/tenant/PieceworkEntry';
import type { ProductionOrderDoc } from '../models/tenant/ProductionOrder';
import type { ProductUnit } from '../businessTypes';
import { isValidQty, roundQty } from '../qty';
import { tashkentDayKey, tashkentDayStart } from '../period';
import { isDupKey } from '../posSync';
import { logError } from '../logger';
import { tr } from '../i18n/fmt';
import { fmtMoney } from '../format';
import { lineAmount, pieceworkAllows, summarizePiecework, PRODUCTION_LIMITS as L, type WorkerSummary, type Bucket } from './calc';
import { audit, dateRange, oid, pageArgs, resolveOwnBranch } from './common';
import { fail, guard, iso, ok, scoped, validId, type OpResult, type ProductionCtx } from './context';

/** Ishbay to'lovi kassa chiqimi toifasi (DEFAULT_FINANCE_CATEGORIES dagi «Ish haqi») */
export const PIECEWORK_CATEGORY = 'Ish haqi';

export interface PieceworkView {
  id: string;
  workerId: string;
  workerName: string;
  branchId: string | null;
  productionOrderId: string | null;
  productionOrderNo: string | null;
  operation: string;
  qty: number;
  /** Miqdor birligi (aktdagi tayyor mahsulot birligi); aktsiz yozuvda — null (kasr ruxsat) */
  unit: ProductUnit | null;
  rate: number;
  amount: number;
  status: PieceworkStatus;
  workDate: string | null;
  note: string | null;
  loggedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectReason: string | null;
  paidBy: string | null;
  paidAt: string | null;
  cashFlowId: string | null;
  createdAt: string | null;
  can: { edit: boolean; approve: boolean; reject: boolean; pay: boolean };
}

const approver = (ctx: ProductionCtx) => ctx.perms.has('piecework.approve');

function entryView(ctx: ProductionCtx, e: PieceworkEntryDoc): PieceworkView {
  const mine = String(e.workerId) === ctx.user.id;
  const appr = approver(ctx);
  return {
    id: String(e._id),
    workerId: String(e.workerId),
    workerName: e.workerName,
    branchId: e.branchId ? String(e.branchId) : null,
    productionOrderId: e.productionOrderId ? String(e.productionOrderId) : null,
    productionOrderNo: e.productionOrderNo ?? null,
    operation: e.operation,
    qty: e.qty,
    unit: e.unit ?? null,
    rate: e.rate,
    amount: e.amount,
    status: e.status,
    workDate: iso(e.workDate),
    note: e.note || null,
    loggedBy: e.loggedBy,
    approvedBy: e.approvedBy ?? null,
    approvedAt: iso(e.approvedAt),
    rejectedBy: e.rejectedBy ?? null,
    rejectReason: e.rejectReason ?? null,
    paidBy: e.paidBy ?? null,
    paidAt: iso(e.paidAt),
    cashFlowId: e.cashFlowId ? String(e.cashFlowId) : null,
    createdAt: iso(e.createdAt),
    can: {
      edit: pieceworkAllows(e.status, 'edit') && (appr || mine),
      approve: appr && pieceworkAllows(e.status, 'approve'),
      reject: appr && pieceworkAllows(e.status, 'reject'),
      pay: appr && pieceworkAllows(e.status, 'pay'),
    },
  };
}

/**
 * Ko'rish doirasi: tasdiqlovchi — hammasi (filial xodimi bo'lsa o'z filiali); ishchi — faqat o'zi.
 */
function entryScope(ctx: ProductionCtx): Record<string, unknown> {
  if (!approver(ctx)) return { workerId: oid(ctx.user.id) };
  if (scoped(ctx)) return { branchId: oid(ctx.user.branchId!) };
  return {};
}

/* ───────────────────────────── yozish ───────────────────────────── */

export interface LogInput {
  workerId?: string;
  productionOrderId?: string;
  operation: string;
  qty: number;
  rate?: number;
  workDate?: Date;
  note?: string;
  clientId?: string;
}

/** Ishbay yozish (`piecework.log`). `clientId` — mobil/oflayn takroriy yuborishdan himoya (ishchi ichida noyob) */
export async function logPiecework(ctx: ProductionCtx, input: LogInput): Promise<OpResult<{ entry: PieceworkView; existing: boolean }>> {
  const denied = guard(ctx, 'piecework', 'piecework.log');
  if (denied) return denied;
  const workerId = input.workerId ?? ctx.user.id;
  if (workerId !== ctx.user.id && !approver(ctx)) return fail(ctx.d, 'noPermission', { label: ctx.d.catalog.permissions['piecework.approve'].label });
  if (!validId(workerId)) return fail(ctx.d, 'workerNotFound');
  if (input.clientId) {
    const prev = await ctx.m.PieceworkEntry.findOne({ workerId: oid(workerId), clientId: input.clientId }).lean<PieceworkEntryDoc>();
    if (prev) return ok({ entry: entryView(ctx, prev), existing: true });
  }
  const worker = await ctx.m.User.findOne({ _id: workerId, active: true }).select('username fullName branchId').lean();
  if (!worker) return fail(ctx.d, 'workerNotFound');
  if (scoped(ctx) && workerId !== ctx.user.id && String(worker.branchId ?? '') !== ctx.user.branchId) return fail(ctx.d, 'workerNotFound');

  let order: ProductionOrderDoc | null = null;
  let rate = input.rate;
  let operation = input.operation.trim();
  let unit: ProductUnit | undefined;
  if (input.productionOrderId) {
    const b = scoped(ctx) ? oid(ctx.user.branchId!) : null;
    order = await ctx.m.ProductionOrder.findOne({
      _id: input.productionOrderId, status: { $ne: 'cancelled' },
      ...(b ? { $or: [{ fromBranchId: b }, { toBranchId: b }] } : {}),
    })
      .select('docNo recipeSnapshot.operations recipeSnapshot.unit labor fromBranchId').lean<ProductionOrderDoc>();
    if (!order) return fail(ctx.d, 'orderNotFound');
    const op = findOperation(order, operation);
    if (op) {
      rate = op.rate;
      operation = op.name;
    }
    unit = order.recipeSnapshot.unit ?? 'dona';
  }
  if (rate === undefined) return fail(ctx.d, 'rateRequired');
  // Kasr qoidasi: aktdagi tayyor mahsulot birligi bo'yicha (dona — butun); aktsiz yozuvda — kasr ruxsat
  if (unit && !isValidQty(input.qty, unit)) return fail(ctx.d, 'badQty', { name: operation });

  const doc = {
    workerId: oid(workerId),
    workerName: worker.fullName || worker.username,
    ...(worker.branchId ? { branchId: worker.branchId } : order ? { branchId: order.fromBranchId } : {}),
    ...(order ? { productionOrderId: order._id, productionOrderNo: order.docNo } : {}),
    operation,
    qty: roundQty(input.qty),
    ...(unit ? { unit } : {}),
    rate,
    amount: lineAmount(rate, input.qty),
    status: 'logged' as const,
    workDate: input.workDate ?? new Date(),
    note: input.note || undefined,
    ...(input.clientId ? { clientId: input.clientId } : {}),
    loggedBy: ctx.user.username,
  };
  try {
    const created = await ctx.m.PieceworkEntry.create(doc);
    const e = created.toObject() as PieceworkEntryDoc;
    await audit(ctx, 'production', 'piecework.log', String(e._id), `Ishbay: ${doc.workerName} — ${operation} × ${doc.qty} = ${fmtMoney(doc.amount)} so'm${order ? ` (${order.docNo})` : ''}`);
    return ok({ entry: entryView(ctx, e), existing: false });
  } catch (err) {
    if (isDupKey(err) && input.clientId) {
      const prev = await ctx.m.PieceworkEntry.findOne({ workerId: oid(workerId), clientId: input.clientId }).lean<PieceworkEntryDoc>();
      if (prev) return ok({ entry: entryView(ctx, prev), existing: true });
    }
    throw err;
  }
}

/** Akt texkartasi (yoki qo'lda ish haqi) operatsiyasi — nomi katta-kichik harfsiz mos */
function findOperation(order: Pick<ProductionOrderDoc, 'recipeSnapshot' | 'labor'>, name: string): { name: string; rate: number } | null {
  const key = name.trim().toLowerCase();
  const r = order.recipeSnapshot.operations.find((o) => o.name.toLowerCase() === key);
  if (r) return { name: r.name, rate: r.rate };
  const l = order.labor?.find((x) => x.operation.toLowerCase() === key);
  return l ? { name: l.operation, rate: l.rate } : null;
}

/**
 * Yozuvni tuzatish (faqat «yozildi» holatida): ishchi — o'zinikini (miqdor, operatsiya; narxsiz), tasdiqlovchi — narx
 * ham. Aktga bog'langan yozuvda operatsiya o'zgarsa narx yana texkartadan olinadi (ishchi narxni chetlab o'tolmaydi).
 * `ownOnly` — faqat o'z yozuvi (mobil ilova: tasdiqlovchi ham bu yo'l bilan boshqaning yozuvini o'zgartirmaydi).
 */
export async function editPiecework(ctx: ProductionCtx, input: { id: string; qty?: number; rate?: number; operation?: string }, opts: { ownOnly?: boolean } = {}): Promise<OpResult<{ entry: PieceworkView }>> {
  const denied = guard(ctx, 'piecework', ['piecework.log', 'piecework.approve']);
  if (denied) return denied;
  if (!validId(input.id)) return fail(ctx.d, 'entryNotFound');
  const e = await ctx.m.PieceworkEntry.findOne({ _id: input.id, ...entryScope(ctx), ...(opts.ownOnly ? { workerId: oid(ctx.user.id) } : {}) }).lean<PieceworkEntryDoc>();
  if (!e) return fail(ctx.d, 'entryNotFound');
  if (!pieceworkAllows(e.status, 'edit')) return fail(ctx.d, 'badTransition');
  const appr = approver(ctx) && !opts.ownOnly;
  // Aktga bog'langan yozuv narxi — texkartadan; ishchi narxni o'zgartira olmaydi
  if (input.rate !== undefined && !appr) return fail(ctx.d, 'noPermission', { label: ctx.d.catalog.permissions['piecework.approve'].label });
  const qty = input.qty !== undefined ? roundQty(input.qty) : e.qty;
  if (input.qty !== undefined && e.unit && !isValidQty(qty, e.unit)) return fail(ctx.d, 'badQty', { name: e.operation });
  let rate = input.rate !== undefined ? input.rate : e.rate;
  let operation: string | undefined;
  const nextOp = input.operation?.trim();
  if (nextOp && nextOp.toLowerCase() !== e.operation.toLowerCase()) {
    operation = nextOp;
    if (e.productionOrderId) {
      const order = await ctx.m.ProductionOrder.findById(e.productionOrderId).select('recipeSnapshot.operations labor').lean<ProductionOrderDoc>();
      const op = order ? findOperation(order, nextOp) : null;
      if (op) {
        operation = op.name;
        if (input.rate === undefined || !appr) rate = op.rate;
      } else if (!appr) {
        return fail(ctx.d, 'rateRequired');
      }
    }
  }
  const set: Record<string, unknown> = { qty, rate, amount: lineAmount(rate, qty) };
  if (operation) set.operation = operation;
  const saved = await ctx.m.PieceworkEntry.findOneAndUpdate({ _id: e._id, status: 'logged' }, { $set: set }, { new: true }).lean<PieceworkEntryDoc>();
  if (!saved) return fail(ctx.d, 'conflict');
  await audit(ctx, 'production', 'piecework.edit', input.id, `Ishbay tuzatildi: ${e.workerName} — ${saved.operation} × ${qty} = ${fmtMoney(saved.amount)} so'm`, { before: { qty: e.qty, rate: e.rate } });
  return ok({ entry: entryView(ctx, saved) });
}

/* ───────────────────────────── tasdiqlash / rad etish ───────────────────────────── */

async function decide(ctx: ProductionCtx, ids: string[], to: 'approved' | 'rejected', reason?: string): Promise<OpResult<{ updated: number; skipped: number }>> {
  const denied = guard(ctx, 'piecework', 'piecework.approve');
  if (denied) return denied;
  const uniq = [...new Set(ids)].filter(validId);
  const now = new Date();
  const set = to === 'approved'
    ? { status: 'approved', approvedBy: ctx.user.username, approvedAt: now }
    : { status: 'rejected', rejectedBy: ctx.user.username, rejectedAt: now, ...(reason ? { rejectReason: reason } : {}) };
  const res = await ctx.m.PieceworkEntry.updateMany({ _id: { $in: uniq.map(oid) }, status: 'logged', ...entryScope(ctx) }, { $set: set });
  const updated = res.modifiedCount;
  if (updated) await audit(ctx, 'production', to === 'approved' ? 'piecework.approve' : 'piecework.reject', uniq[0], `Ishbay: ${updated} ta yozuv ${to === 'approved' ? 'tasdiqlandi' : 'rad etildi'}${reason ? ` (${reason})` : ''}`, { ids: uniq.slice(0, 50) });
  return ok({ updated, skipped: uniq.length - updated });
}

export const approvePiecework = (ctx: ProductionCtx, ids: string[]) => decide(ctx, ids, 'approved');
export const rejectPiecework = (ctx: ProductionCtx, ids: string[], reason?: string) => decide(ctx, ids, 'rejected', reason);

/* ───────────────────────────── to'lov ───────────────────────────── */

export interface PayInput {
  workerId: string;
  /** Yo'q — ishchining barcha tasdiqlangan (davrdagi) yozuvlari */
  ids?: string[];
  from?: Date;
  to?: Date;
  /** Kassa chiqimi filiali (filial xodimida — o'z filiali) */
  branchId?: string;
  clientId?: string;
}

export interface PayResult {
  payoutId: string;
  workerId: string;
  workerName: string;
  count: number;
  amount: number;
  cashFlowId: string;
  existing: boolean;
}

/** Ishchiga to'lash: tasdiqlangan yozuvlar → paid + CashFlow chiqimi (Ish haqi). Takroriy `clientId` — avvalgi natija */
export async function payPiecework(ctx: ProductionCtx, input: PayInput): Promise<OpResult<PayResult>> {
  const denied = guard(ctx, 'piecework', 'piecework.approve');
  if (denied) return denied;
  if (!validId(input.workerId)) return fail(ctx.d, 'workerNotFound');
  const payoutId = input.clientId ? `c:${input.clientId}` : randomUUID();

  if (input.clientId) {
    const prev = await ctx.m.PieceworkEntry.find({ payoutId }).select('workerId workerName amount cashFlowId').lean<PieceworkEntryDoc[]>();
    if (prev.length) {
      return ok({
        payoutId, workerId: String(prev[0].workerId), workerName: prev[0].workerName, count: prev.length,
        amount: prev.reduce((s, e) => s + e.amount, 0), cashFlowId: String(prev[0].cashFlowId ?? ''), existing: true,
      });
    }
  }

  let branchId: string | undefined;
  if (input.branchId || scoped(ctx)) {
    const b = await resolveOwnBranch(ctx, input.branchId);
    if (!b.ok) return b;
    branchId = b.data;
  }

  const filter: Record<string, unknown> = { workerId: oid(input.workerId), status: 'approved', ...entryScope(ctx) };
  if (input.ids?.length) filter._id = { $in: [...new Set(input.ids)].filter(validId).map(oid) };
  const range = dateRange(input.from, input.to);
  if (range) filter.workDate = range;
  const candidates = await ctx.m.PieceworkEntry.find(filter).select('_id').limit(L.maxBatchIds).lean();
  if (!candidates.length) return fail(ctx.d, 'nothingToPay');

  // 1) Yozuvlar «to'landi» (faqat hali tasdiqlangan holatdagilari — parallel to'lov ikki marta to'lamaydi)
  const now = new Date();
  await ctx.m.PieceworkEntry.updateMany(
    { _id: { $in: candidates.map((c) => c._id) }, status: 'approved' },
    { $set: { status: 'paid', payoutId, paidBy: ctx.user.username, paidAt: now } },
  );
  const paid = await ctx.m.PieceworkEntry.find({ payoutId }).select('workerName amount').lean<PieceworkEntryDoc[]>();
  if (!paid.length) return fail(ctx.d, 'nothingToPay');
  const amount = paid.reduce((s, e) => s + e.amount, 0);
  const workerName = paid[0].workerName;
  const revert = () => ctx.m.PieceworkEntry.updateMany(
    { payoutId },
    { $set: { status: 'approved' }, $unset: { payoutId: 1, paidBy: 1, paidAt: 1, cashFlowId: 1 } },
  );

  // 2) Kassa chiqimi (mavjud CashFlow naqshi; toifa — «Ish haqi», yo'q bo'lsa yaratiladi)
  let cashFlowId: Types.ObjectId | null = null;
  try {
    await ctx.m.FinanceCategory.updateOne(
      { name: PIECEWORK_CATEGORY, type: 'expense' },
      { $setOnInsert: { name: PIECEWORK_CATEGORY, type: 'expense', active: true } },
      { upsert: true },
    ).catch((e) => { if (!isDupKey(e)) throw e; });
    if (amount > 0) {
      const cf = await ctx.m.CashFlow.create({
        type: 'expense', amount, category: PIECEWORK_CATEGORY, recordedBy: ctx.user.username,
        description: tr(ctx.d.production.auto.pieceworkCashFlow, { name: workerName, n: paid.length }),
        ...(branchId ? { branchId: oid(branchId) } : {}),
      });
      cashFlowId = cf._id as Types.ObjectId;
    }
  } catch (e) {
    logError('piecework pay cashflow failed', e, { dbName: ctx.user.dbName });
    await revert().catch((err) => logError('piecework pay revert failed', err));
    return fail(ctx.d, 'failed');
  }
  if (cashFlowId) await ctx.m.PieceworkEntry.updateMany({ payoutId }, { $set: { cashFlowId } });

  await audit(ctx, 'finance', 'piecework.pay', cashFlowId ? String(cashFlowId) : payoutId,
    `Ishbay to'lovi: ${workerName} — ${paid.length} ta yozuv, ${fmtMoney(amount)} so'm`, { payoutId, workerId: input.workerId, amount, count: paid.length });
  return ok({ payoutId, workerId: input.workerId, workerName, count: paid.length, amount, cashFlowId: cashFlowId ? String(cashFlowId) : '', existing: false });
}

/* ───────────────────────────── o'qish ───────────────────────────── */

export interface PieceworkList {
  items: PieceworkView[];
  total: number;
  page: number;
  limit: number;
  /** Filtrga mos barcha yozuvlar bo'yicha (sahifadan qat'i nazar) */
  sums: { logged: Bucket; approved: Bucket; paid: Bucket; due: number };
}

export async function listPiecework(
  ctx: ProductionCtx,
  q: { status?: string; workerId?: string; productionOrderId?: string; from?: Date; to?: Date; page?: number; limit?: number; mine?: boolean } = {},
): Promise<OpResult<PieceworkList>> {
  const denied = guard(ctx, 'piecework', ['piecework.log', 'piecework.approve']);
  if (denied) return denied;
  const filter: Record<string, unknown> = { ...entryScope(ctx) };
  if (q.mine) filter.workerId = oid(ctx.user.id);
  else if (q.workerId && validId(q.workerId) && approver(ctx)) filter.workerId = oid(q.workerId);
  if (q.status && ['logged', 'approved', 'rejected', 'paid'].includes(q.status)) filter.status = q.status;
  if (q.productionOrderId && validId(q.productionOrderId)) filter.productionOrderId = oid(q.productionOrderId);
  const range = dateRange(q.from, q.to);
  if (range) filter.workDate = range;
  const { skip, limit, page } = pageArgs(q);
  const [list, total, all] = await Promise.all([
    ctx.m.PieceworkEntry.find(filter).sort({ workDate: -1, createdAt: -1 }).skip(skip).limit(limit).lean<PieceworkEntryDoc[]>(),
    ctx.m.PieceworkEntry.countDocuments(filter),
    ctx.m.PieceworkEntry.find(filter).select('workerId workerName operation qty amount status').limit(10_000).lean<PieceworkEntryDoc[]>(),
  ]);
  const { totals } = summarizePiecework(all.map((e) => ({ workerId: String(e.workerId), workerName: e.workerName, operation: e.operation, qty: e.qty, amount: e.amount, status: e.status })));
  return ok({ items: list.map((e) => entryView(ctx, e)), total, page, limit, sums: totals });
}

/** Xodim bo'yicha davr jamlamasi (ishchi — faqat o'zi). Davr ≤ 366 kun, standart — joriy oy */
export async function pieceworkSummary(
  ctx: ProductionCtx,
  q: { from?: Date; to?: Date; workerId?: string } = {},
): Promise<OpResult<{ from: string; to: string; workers: WorkerSummary[]; totals: { logged: Bucket; approved: Bucket; paid: Bucket; due: number } }>> {
  const denied = guard(ctx, 'piecework', ['piecework.log', 'piecework.approve']);
  if (denied) return denied;
  const now = new Date();
  // Standart davr — joriy oy (Toshkent vaqti bo'yicha)
  const from = q.from ?? tashkentDayStart(`${tashkentDayKey(now).slice(0, 7)}-01`);
  let to = q.to ?? now;
  if (to.getTime() - from.getTime() > L.maxPeriodDays * 86_400_000) to = new Date(from.getTime() + L.maxPeriodDays * 86_400_000);
  const filter: Record<string, unknown> = { ...entryScope(ctx), workDate: dateRange(from, to) };
  if (q.workerId && validId(q.workerId) && approver(ctx)) filter.workerId = oid(q.workerId);
  const rows = await ctx.m.PieceworkEntry.find(filter).select('workerId workerName operation qty amount status').limit(50_000).lean<PieceworkEntryDoc[]>();
  const s = summarizePiecework(rows.map((e) => ({ workerId: String(e.workerId), workerName: e.workerName, operation: e.operation, qty: e.qty, amount: e.amount, status: e.status })));
  return ok({ from: from.toISOString(), to: to.toISOString(), ...s });
}

export interface WorkerOption {
  id: string;
  name: string;
  /** Faqat `piecework.approve` bilan (ishbay sahifasi); akt ish haqi tanlovida (`production.manage`) — berilmaydi */
  username?: string;
  branchId?: string | null;
}

/**
 * Ishchilar ro'yxati (tanlash uchun): faol foydalanuvchilar; filial xodimiga — o'z filiali.
 * Huquq: `piecework.approve` (ishbay moduli) — to'liq; yoki `production.manage` (ishlab chiqarish moduli) — akt ish
 * haqi qatorida ishchi tanlash uchun faqat id va ism.
 */
export async function listWorkers(ctx: ProductionCtx): Promise<OpResult<{ workers: WorkerOption[] }>> {
  const full = ctx.features.piecework && ctx.perms.has('piecework.approve');
  if (!full) {
    const denied = guard(ctx, 'production', 'production.manage');
    if (denied) return denied;
  }
  const filter: Record<string, unknown> = { active: true };
  if (scoped(ctx)) filter.branchId = oid(ctx.user.branchId!);
  const users = await ctx.m.User.find(filter).select('username fullName branchId role').sort({ username: 1 }).limit(500).lean();
  return ok({
    workers: users.map((u) => (full
      ? { id: String(u._id), username: u.username, name: u.fullName || u.username, branchId: u.branchId ? String(u.branchId) : null }
      : { id: String(u._id), name: u.fullName || u.username })),
  });
}
