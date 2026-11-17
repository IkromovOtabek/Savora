/**
 * Kirim akti (yetkazib beruvchidan tovar qabul qilish) — server, DB. Hujjat: docs/SEX_API.md §6.
 *
 *  - Qator xarid birligida (qop) yoki asosiy birlikda (kg) kiritiladi; omborga asosiy birlikda tushadi.
 *  - Narx: `product.viewCost` (kelish narxini ko'rish) bo'lmasa — kiritilgan narx e'tiborsiz, mavjud qator narxi
 *    saqlanadi, PO bo'yicha qabulda — PO narxi. Narxsiz qator bo'lsa post qilinmaydi (`pricesRequired`).
 *  - Post: ombor kirimi (o'rtacha tannarx) → SupplierEntry purchase (+ paidNow bo'lsa payment) → PO `receivedQty`/holat.
 *    Ombor/yetkazib beruvchi yozuvi tushmasa — hammasi qaytariladi.
 */
import type { Types } from 'mongoose';
import type { GoodsReceiptDoc, IReceiptLine, ReceiptStatus } from '../models/tenant/GoodsReceipt';
import type { IPoLine, PurchaseOrderDoc } from '../models/tenant/PurchaseOrder';
import type { ProductDoc } from '../models/tenant/Product';
import type { ProductUnit } from '../businessTypes';
import { branchFilter } from '../branchScope';
import { datePrefix, nextDocNo } from '../counters';
import { qtyLabel, roundQty } from '../qty';
import { runWithCompensation } from '../compensate';
import { isDupKey } from '../posSync';
import { logError } from '../logger';
import { tr } from '../i18n/fmt';
import { fmtMoney } from '../format';
import { lineAmount, lineQty, poAllows, poRemaining, poStatusAfterReceipt, receiptAllows } from './calc';
import { ensureItemCode, GOODS_ONLY, receiveStock } from './stock';
import { acquireLock, audit, branchNames, dateRange, oid, pageArgs, releaseLock, resolveOwnBranch, searchRegex } from './common';
import { canViewPrices, fail, guard, iso, ok, scoped, validId, type OpResult, type ProductionCtx } from './context';

/* ───────────────────────────── ko'rinish ───────────────────────────── */

export interface ReceiptLineView {
  id: string;
  productId: string;
  code: string;
  name: string;
  qty: number;
  unit: ProductUnit | null;
  factor: number;
  baseQty: number;
  baseUnit: ProductUnit | null;
  /** `product.viewCost` bo'lmasa — null (yashirin) */
  price: number | null;
  amount: number | null;
  /** Narx kiritilganmi (yashirin bo'lsa ham) */
  priced: boolean;
  expiryDate: string | null;
  poLineId: string | null;
}

export interface ReceiptView {
  id: string;
  docNo: string;
  status: ReceiptStatus;
  supplierId: string | null;
  supplierName: string | null;
  branchId: string;
  branchName: string | null;
  purchaseOrderId: string | null;
  purchaseOrderNo: string | null;
  supplierInvoiceNo: string | null;
  invoiceDate: string | null;
  lines: ReceiptLineView[];
  /** `product.viewCost` bo'lmasa — null */
  total: number | null;
  paidNow: number | null;
  /** Qarzga (total − paidNow) */
  debt: number | null;
  /** Narxsiz qatorlar soni (post uchun 0 bo'lishi kerak) */
  unpriced: number;
  note: string | null;
  createdBy: string;
  createdAt: string | null;
  postedAt: string | null;
  postedBy: string | null;
  cancelledAt: string | null;
  updatedAt: string | null;
  rev: number;
  can: { edit: boolean; post: boolean; cancel: boolean; viewPrices: boolean; setPayment: boolean };
}

function receiptView(ctx: ProductionCtx, r: GoodsReceiptDoc, names: Map<string, string>): ReceiptView {
  const prices = canViewPrices(ctx);
  const manage = ctx.perms.has('receipt.create') && (!scoped(ctx) || String(r.branchId) === ctx.user.branchId);
  const unpriced = (r.lines ?? []).filter((l) => l.price === undefined || l.price === null).length;
  return {
    id: String(r._id),
    docNo: r.docNo,
    status: r.status,
    supplierId: r.supplierId ? String(r.supplierId) : null,
    supplierName: r.supplierName ?? null,
    branchId: String(r.branchId),
    branchName: names.get(String(r.branchId)) ?? null,
    purchaseOrderId: r.purchaseOrderId ? String(r.purchaseOrderId) : null,
    purchaseOrderNo: r.purchaseOrderNo ?? null,
    supplierInvoiceNo: r.supplierInvoiceNo || null,
    invoiceDate: iso(r.invoiceDate),
    lines: (r.lines ?? []).map((l) => ({
      id: String(l._id), productId: String(l.productId), code: l.code, name: l.name, qty: l.qty, unit: l.unit ?? null,
      factor: l.factor ?? 1, baseQty: l.baseQty, baseUnit: l.baseUnit ?? null,
      price: prices ? l.price ?? null : null, amount: prices ? l.amount ?? null : null,
      priced: l.price !== undefined && l.price !== null,
      expiryDate: iso(l.expiryDate), poLineId: l.poLineId ? String(l.poLineId) : null,
    })),
    total: prices ? r.total ?? 0 : null,
    paidNow: prices ? r.paidNow ?? 0 : null,
    debt: prices ? Math.max(0, (r.total ?? 0) - (r.paidNow ?? 0)) : null,
    unpriced,
    note: r.note || null,
    createdBy: r.createdBy,
    createdAt: iso(r.createdAt),
    postedAt: iso(r.postedAt),
    postedBy: r.postedBy ?? null,
    cancelledAt: iso(r.cancelledAt),
    updatedAt: iso(r.updatedAt),
    rev: r.rev ?? 0,
    can: {
      edit: manage && receiptAllows(r.status, 'edit'),
      post: manage && receiptAllows(r.status, 'post'),
      cancel: manage && receiptAllows(r.status, 'cancel'),
      viewPrices: prices,
      setPayment: prices && ctx.perms.has('suppliers.manage'),
    },
  };
}

async function viewOf(ctx: ProductionCtx, r: GoodsReceiptDoc): Promise<ReceiptView> {
  return receiptView(ctx, r, await branchNames(ctx, [r.branchId]));
}

const receiptScope = (ctx: ProductionCtx) => (scoped(ctx) ? { branchId: oid(ctx.user.branchId!) } : {});

async function loadReceipt(ctx: ProductionCtx, id: string): Promise<OpResult<GoodsReceiptDoc>> {
  if (!validId(id)) return fail(ctx.d, 'receiptNotFound');
  const r = await ctx.m.GoodsReceipt.findOne({ _id: id, ...receiptScope(ctx) }).lean<GoodsReceiptDoc>();
  return r ? ok(r) : fail(ctx.d, 'receiptNotFound');
}

/* ───────────────────────────── qatorlarni tayyorlash ───────────────────────────── */

export interface DocLineInput {
  productId: string;
  qty: number;
  unit?: ProductUnit | null;
  /** null — narx hali kiritilmagan; undefined — o'zgartirilmaydi */
  price?: number | null;
  expiryDate?: Date;
  poLineId?: string;
}

/**
 * Hujjat qatorlari (kirim va xarid uchun umumiy): mahsulot (foydalanuvchi ko'ra oladigan, sanaladigan tovar),
 * birlik → koeffitsient, asosiy miqdor, barqaror kod; narx — huquq bo'lsa kiritilgani, aks holda `keepPrice`.
 */
export async function prepareDocLines(
  ctx: ProductionCtx,
  inputs: readonly DocLineInput[],
  keepPrice: (productId: string, code: string, unit: ProductUnit | undefined) => number | undefined,
): Promise<OpResult<(Omit<IReceiptLine, 'poLineId'> & { poLineId?: string })[]>> {
  const ids = [...new Set(inputs.map((l) => l.productId))];
  const products = await ctx.m.Product.find({ _id: { $in: ids }, ...branchFilter(ctx.user), ...GOODS_ONLY }).lean<ProductDoc[]>();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const prices = canViewPrices(ctx);
  const out: (Omit<IReceiptLine, 'poLineId'> & { poLineId?: string })[] = [];
  const seen = new Set<string>();
  for (const l of inputs) {
    const p = byId.get(l.productId);
    if (!p) return fail(ctx.d, 'productNotFound');
    if (!p.trackQuantity) return fail(ctx.d, 'notCountable', { name: p.name });
    const q = lineQty(p, l.qty, l.unit);
    if (!q.ok) return fail(ctx.d, q.reason, { name: p.name });
    const unit = (l.unit || p.unit || undefined) as ProductUnit | undefined;
    const code = await ensureItemCode(ctx.m.Product, p);
    const key = `${code}|${unit ?? ''}|${l.poLineId ?? ''}`;
    if (seen.has(key)) return fail(ctx.d, 'duplicateLine', { name: p.name });
    seen.add(key);
    const price = prices && l.price !== undefined ? (l.price ?? undefined) : keepPrice(l.productId, code, unit);
    out.push({
      productId: p._id, code, name: p.name, qty: roundQty(l.qty), unit, factor: q.factor, baseQty: q.baseQty, baseUnit: p.unit,
      ...(price !== undefined ? { price, amount: lineAmount(price, l.qty) } : {}),
      ...(l.expiryDate ? { expiryDate: l.expiryDate } : {}),
      ...(l.poLineId ? { poLineId: l.poLineId } : {}),
    });
  }
  return ok(out);
}

const sumAmounts = (lines: readonly { amount?: number | null }[]) => lines.reduce((s, l) => s + (l.amount ?? 0), 0);

/* ───────────────────────────── yaratish / tahrir ───────────────────────────── */

export interface ReceiptInput {
  supplierId?: string;
  branchId?: string;
  purchaseOrderId?: string;
  supplierInvoiceNo?: string;
  invoiceDate?: Date;
  note?: string;
  paidNow?: number;
  lines: DocLineInput[];
  clientId?: string;
}

async function loadPo(ctx: ProductionCtx, id: string): Promise<PurchaseOrderDoc | null> {
  if (!validId(id)) return null;
  return ctx.m.PurchaseOrder.findOne({ _id: id, ...(scoped(ctx) ? { branchId: oid(ctx.user.branchId!) } : {}) }).lean<PurchaseOrderDoc>();
}

/**
 * Qoralama yaratish (`id` yo'q) yoki tahrirlash (draft). PO bilan — yetkazib beruvchi va ombor PO'dan,
 * `poLineId`'siz qator shu kodli birinchi qolgan PO qatoriga bog'lanadi, narx berilmasa — PO narxi.
 */
export async function saveReceipt(ctx: ProductionCtx, id: string | null, input: ReceiptInput): Promise<OpResult<{ receipt: ReceiptView; existing: boolean }>> {
  const denied = guard(ctx, 'purchasing', 'receipt.create');
  if (denied) return denied;

  let cur: GoodsReceiptDoc | null = null;
  if (id) {
    const loaded = await loadReceipt(ctx, id);
    if (!loaded.ok) return loaded;
    cur = loaded.data;
    if (!receiptAllows(cur.status, 'edit')) return fail(ctx.d, 'badTransition');
    if (cur.postingAt) return fail(ctx.d, 'locked');
  } else if (input.clientId) {
    const prev = await ctx.m.GoodsReceipt.findOne({ clientId: input.clientId, ...receiptScope(ctx) }).lean<GoodsReceiptDoc>();
    if (prev) return ok({ receipt: await viewOf(ctx, prev), existing: true });
  }

  // Xarid buyurtmasi
  let po: PurchaseOrderDoc | null = null;
  const poId = input.purchaseOrderId ?? (cur?.purchaseOrderId ? String(cur.purchaseOrderId) : undefined);
  if (poId) {
    po = await loadPo(ctx, poId);
    if (!po) return fail(ctx.d, 'poNotFound');
    if (!poAllows(po.status, 'receive')) return fail(ctx.d, 'poClosed');
    if (input.supplierId && input.supplierId !== String(po.supplierId)) return fail(ctx.d, 'poMismatch');
  }

  // Ombor
  const branchReq = input.branchId ?? (po ? String(po.branchId) : cur ? String(cur.branchId) : undefined);
  const branch = await resolveOwnBranch(ctx, branchReq);
  if (!branch.ok) return branch;
  if (po && String(po.branchId) !== branch.data) return fail(ctx.d, 'poMismatch');

  // Yetkazib beruvchi
  const supplierId = po ? String(po.supplierId) : input.supplierId;
  let supplierName: string | undefined;
  if (supplierId) {
    const s = await ctx.m.Supplier.findById(supplierId).select('name').lean();
    if (!s) return fail(ctx.d, 'supplierNotFound');
    supplierName = s.name;
  }

  // Qatorlar: narx — huquq bo'lsa kiritilgani; aks holda mavjud qator yoki PO narxi
  const poLines = po?.lines ?? [];
  const usedPoLines = new Set<string>();
  const linkPo = (code: string, poLineId?: string): IPoLine | undefined => {
    if (!po) return undefined;
    if (poLineId) return poLines.find((l) => String(l._id) === poLineId);
    const pl = poLines.find((l) => l.code === code && !usedPoLines.has(String(l._id)) && poRemaining(l) > 0);
    return pl;
  };
  const prepared = await prepareDocLines(ctx, input.lines, (productId, code, unit) => {
    const old = cur?.lines.find((l) => String(l.productId) === productId && (l.unit ?? undefined) === unit);
    if (old?.price !== undefined && old?.price !== null) return old.price;
    const pl = linkPo(code);
    return pl && pl.price !== undefined && pl.price !== null && (pl.unit ?? undefined) === unit ? pl.price : undefined;
  });
  if (!prepared.ok) return prepared;
  const lines: IReceiptLine[] = [];
  for (const l of prepared.data) {
    const pl = linkPo(l.code, l.poLineId);
    if (l.poLineId && !pl) return fail(ctx.d, 'poMismatch');
    if (pl) usedPoLines.add(String(pl._id));
    const { poLineId: _drop, ...rest } = l;
    void _drop;
    lines.push({ ...rest, ...(pl ? { poLineId: pl._id } : {}) });
  }
  const total = sumAmounts(lines);
  const canPay = canViewPrices(ctx) && ctx.perms.has('suppliers.manage');
  const paidNow = canPay && input.paidNow !== undefined ? input.paidNow : cur?.paidNow ?? 0;

  const fields = {
    ...(supplierId ? { supplierId: oid(supplierId), supplierName } : {}),
    branchId: oid(branch.data),
    ...(po ? { purchaseOrderId: po._id, purchaseOrderNo: po.docNo } : {}),
    supplierInvoiceNo: input.supplierInvoiceNo || undefined,
    invoiceDate: input.invoiceDate,
    note: input.note || undefined,
    lines,
    total,
    paidNow,
  };

  if (cur) {
    const unset: Record<string, 1> = {};
    if (!supplierId) Object.assign(unset, { supplierId: 1, supplierName: 1 });
    if (!input.supplierInvoiceNo) unset.supplierInvoiceNo = 1;
    if (!input.invoiceDate) unset.invoiceDate = 1;
    if (!input.note) unset.note = 1;
    const set = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    const saved = await ctx.m.GoodsReceipt.findOneAndUpdate(
      { _id: cur._id, rev: cur.rev ?? 0, status: 'draft', postingAt: { $exists: false } },
      { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}), $inc: { rev: 1 } },
      { new: true },
    ).lean<GoodsReceiptDoc>();
    if (!saved) return fail(ctx.d, 'conflict');
    await audit(ctx, 'purchase', 'receipt.update', String(cur._id), `Kirim akti ${cur.docNo} tahrirlandi (${lines.length} qator)`);
    return ok({ receipt: await viewOf(ctx, saved), existing: false });
  }

  const docNo = await nextDocNo(ctx.m.GoodsReceipt, 'docNo', 'receipt', datePrefix('K'));
  try {
    const created = await ctx.m.GoodsReceipt.create({
      docNo, status: 'draft', ...fields, ...(input.clientId ? { clientId: input.clientId } : {}), createdBy: ctx.user.username, rev: 0,
    });
    const r = created.toObject() as GoodsReceiptDoc;
    await audit(ctx, 'purchase', 'receipt.create', String(r._id), `Kirim akti ${docNo} yaratildi${supplierName ? ` (${supplierName})` : ''}: ${lines.length} qator`);
    return ok({ receipt: await viewOf(ctx, r), existing: false });
  } catch (e) {
    if (isDupKey(e) && input.clientId) {
      const prev = await ctx.m.GoodsReceipt.findOne({ clientId: input.clientId }).lean<GoodsReceiptDoc>();
      if (prev) return ok({ receipt: await viewOf(ctx, prev), existing: true });
    }
    throw e;
  }
}

/** Qoralamani bekor qilish */
export async function cancelReceipt(ctx: ProductionCtx, id: string): Promise<OpResult<{ receipt: ReceiptView }>> {
  const denied = guard(ctx, 'purchasing', 'receipt.create');
  if (denied) return denied;
  const loaded = await loadReceipt(ctx, id);
  if (!loaded.ok) return loaded;
  const r = loaded.data;
  if (!receiptAllows(r.status, 'cancel')) return fail(ctx.d, 'badTransition');
  const saved = await ctx.m.GoodsReceipt.findOneAndUpdate(
    { _id: r._id, status: 'draft', postingAt: { $exists: false } },
    { $set: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: ctx.user.username }, $inc: { rev: 1 } },
    { new: true },
  ).lean<GoodsReceiptDoc>();
  if (!saved) return fail(ctx.d, r.postingAt ? 'locked' : 'conflict');
  await audit(ctx, 'purchase', 'receipt.cancel', id, `Kirim akti ${r.docNo} bekor qilindi`);
  return ok({ receipt: await viewOf(ctx, saved) });
}

/* ───────────────────────────── post (omborga kirim) ───────────────────────────── */

/**
 * Kirim qilish: ombor (o'rtacha tannarx) → yetkazib beruvchi qarzi (+ to'lov) → PO. `paidNow` — faqat
 * `suppliers.manage` + kelish narxini ko'rish huquqi bilan (aks holda qoralamadagi qiymat).
 */
export async function postReceipt(ctx: ProductionCtx, id: string, input: { paidNow?: number } = {}): Promise<OpResult<{ receipt: ReceiptView; created: string[] }>> {
  const denied = guard(ctx, 'purchasing', 'receipt.create');
  if (denied) return denied;
  const loaded = await loadReceipt(ctx, id);
  if (!loaded.ok) return loaded;
  const r = loaded.data;
  if (!receiptAllows(r.status, 'post')) return fail(ctx.d, 'badTransition');
  if (!r.lines?.length) return fail(ctx.d, 'emptyLines');
  const unpriced = r.lines.filter((l) => l.price === undefined || l.price === null).length;
  if (unpriced) return fail(ctx.d, 'pricesRequired', { n: unpriced });
  const total = sumAmounts(r.lines);
  const canPay = canViewPrices(ctx) && ctx.perms.has('suppliers.manage');
  const paidNow = canPay && input.paidNow !== undefined ? input.paidNow : r.paidNow ?? 0;
  if (paidNow > total) return fail(ctx.d, 'overpaid');
  if (paidNow > 0 && !r.supplierId) return fail(ctx.d, 'paymentNeedsSupplier');

  const lock = await acquireLock(ctx, ctx.m.GoodsReceipt, r, ['draft']);
  if (!lock.ok) return lock;
  const lockAt = lock.data;
  const now = new Date();

  // 1) Ombor — har qator (boshqa filial hujjati tanlangan bo'lsa — shu ombordagi nusxa topiladi/yaratiladi)
  const templates = await ctx.m.Product.find({ _id: { $in: r.lines.map((l) => l.productId) } }).lean<ProductDoc[]>();
  const tById = new Map(templates.map((p) => [String(p._id), p]));
  const failure: { reason: 'productNotFound' | 'notCountable' | 'notReceivable' | 'conflict'; name: string } = { reason: 'conflict', name: '' };
  const received = await runWithCompensation(r.lines, async (l) => {
    const t = tById.get(String(l.productId));
    if (!t) { failure.reason = 'productNotFound'; return null; }
    const res = await receiveStock(ctx.m.Product, {
      branchId: r.branchId, template: t, code: l.code, qty: l.baseQty, unitCost: (l.amount ?? 0) / l.baseQty,
      history: { action: 'restocked', detail: `${r.docNo} · +${qtyLabel(l.baseQty, l.baseUnit)}`, by: ctx.user.username, at: now },
      by: ctx.user.username, expiryDate: l.expiryDate ?? null, supplierId: r.supplierId ?? null,
    });
    if (!res.ok) { failure.name = res.name; failure.reason = res.reason; return null; }
    return { result: { productId: res.productId, created: res.created, undo: res.undo }, undo: res.undo };
  });
  if (!received.ok) {
    await releaseLock(ctx.m.GoodsReceipt, r._id, lockAt);
    if (received.error) logError('receipt post failed', received.error, { dbName: ctx.user.dbName, docNo: r.docNo });
    if (failure.reason === 'productNotFound') return fail(ctx.d, 'productNotFound');
    if (failure.reason === 'conflict') return fail(ctx.d, 'conflict');
    return fail(ctx.d, failure.reason, { name: failure.name });
  }

  // 2) Yetkazib beruvchi qarzi (mavjud SupplierEntry naqshi — sumSupplierEntries o'zgarmaydi)
  let purchaseEntryId: Types.ObjectId | undefined;
  let paymentEntryId: Types.ObjectId | undefined;
  const t = ctx.d.production.auto;
  try {
    if (r.supplierId && total > 0) {
      const e = await ctx.m.SupplierEntry.create({
        supplierId: r.supplierId, type: 'purchase', amount: total, receiptId: r._id, at: now, by: ctx.user.username,
        note: tr(t.supplierPurchase, { no: r.docNo, invoice: r.supplierInvoiceNo ? ` · ${r.supplierInvoiceNo}` : '' }),
      });
      purchaseEntryId = e._id as Types.ObjectId;
    }
    if (r.supplierId && paidNow > 0) {
      const e = await ctx.m.SupplierEntry.create({
        supplierId: r.supplierId, type: 'payment', amount: paidNow, receiptId: r._id, at: now, by: ctx.user.username,
        note: tr(t.supplierPayment, { no: r.docNo }),
      });
      paymentEntryId = e._id as Types.ObjectId;
    }
  } catch (e) {
    logError('receipt supplier entry failed', e, { dbName: ctx.user.dbName, docNo: r.docNo });
    if (purchaseEntryId) await ctx.m.SupplierEntry.deleteOne({ _id: purchaseEntryId }).catch(() => {});
    await undoReceived(received.results);
    await releaseLock(ctx.m.GoodsReceipt, r._id, lockAt);
    return fail(ctx.d, 'failed');
  }

  // 3) Akt — posted (qatorlar endi kirim bo'lgan hujjatlarga ishora qiladi)
  const finalLines = r.lines.map((l, i) => ({ ...l, productId: received.results[i].productId }));
  const saved = await ctx.m.GoodsReceipt.findOneAndUpdate(
    { _id: r._id, postingAt: lockAt },
    {
      $set: {
        status: 'posted', lines: finalLines, total, paidNow, postedAt: now, postedBy: ctx.user.username,
        ...(purchaseEntryId ? { purchaseEntryId } : {}), ...(paymentEntryId ? { paymentEntryId } : {}),
      },
      $unset: { postingAt: 1 },
      $inc: { rev: 1 },
    },
    { new: true },
  ).lean<GoodsReceiptDoc>();
  if (!saved) {
    for (const eid of [purchaseEntryId, paymentEntryId]) if (eid) await ctx.m.SupplierEntry.deleteOne({ _id: eid }).catch(() => {});
    await undoReceived(received.results);
    await releaseLock(ctx.m.GoodsReceipt, r._id, lockAt);
    return fail(ctx.d, 'conflict');
  }

  // 4) Xarid buyurtmasi: qabul qilingan miqdor va holat (xato kirimni bekor qilmaydi — logda)
  if (r.purchaseOrderId) await applyToPo(ctx, r.purchaseOrderId, r.lines).catch((e) => logError('receipt → PO update failed', e, { docNo: r.docNo }));

  await audit(ctx, 'purchase', 'receipt.post', id,
    `Kirim ${r.docNo}${r.supplierName ? ` (${r.supplierName})` : ''}: ${r.lines.length} qator, ${fmtMoney(total)} so'm${paidNow ? `, to'landi ${fmtMoney(paidNow)}` : ''}`,
    { total, paidNow, lines: r.lines.map((l) => ({ code: l.code, qty: l.baseQty })) });
  return ok({ receipt: await viewOf(ctx, saved), created: received.results.filter((x) => x.created).map((x) => String(x.productId)) });
}

/** Kompensatsiya: kirim qilingan qatorlarni teskari tartibda qaytaradi */
async function undoReceived(results: readonly { undo: () => Promise<void> }[]): Promise<void> {
  for (const x of [...results].reverse()) await x.undo().catch((e) => logError('receipt undo failed', e));
}

/** PO qatorlariga qabul qilinganni qo'shadi (qator birligida) va holatni qayta hisoblaydi */
async function applyToPo(ctx: ProductionCtx, poId: Types.ObjectId, lines: readonly IReceiptLine[]): Promise<void> {
  const po = await ctx.m.PurchaseOrder.findById(poId).lean<PurchaseOrderDoc>();
  if (!po) return;
  for (const l of lines) {
    if (!l.poLineId) continue;
    const pl = po.lines.find((x) => String(x._id) === String(l.poLineId));
    if (!pl) continue;
    const inc = roundQty(l.baseQty / (pl.factor || 1));
    await ctx.m.PurchaseOrder.updateOne({ _id: poId }, [
      {
        $set: {
          lines: {
            $map: {
              input: '$lines',
              as: 'x',
              in: { $cond: [{ $eq: ['$$x._id', pl._id] }, { $mergeObjects: ['$$x', { receivedQty: { $round: [{ $add: [{ $ifNull: ['$$x.receivedQty', 0] }, inc] }, 3] } }] }, '$$x'] },
            },
          },
        },
      },
    ]);
  }
  const fresh = await ctx.m.PurchaseOrder.findById(poId).lean<PurchaseOrderDoc>();
  if (!fresh) return;
  const status = poStatusAfterReceipt(fresh.lines, fresh.status);
  if (status !== fresh.status) {
    await ctx.m.PurchaseOrder.updateOne({ _id: poId, status: fresh.status }, { $set: { status, ...(status === 'received' ? { receivedAt: new Date() } : {}) }, $inc: { rev: 1 } });
  }
}

/* ───────────────────────────── o'qish ───────────────────────────── */

const READ_PERMS = ['receipt.create', 'po.manage', 'suppliers.view'] as const;

export interface ReceiptSummary {
  id: string;
  docNo: string;
  status: ReceiptStatus;
  supplierName: string | null;
  branchName: string | null;
  purchaseOrderNo: string | null;
  supplierInvoiceNo: string | null;
  lines: number;
  total: number | null;
  createdBy: string;
  createdAt: string | null;
  postedAt: string | null;
}

export async function listReceipts(
  ctx: ProductionCtx,
  q: { status?: string; branchId?: string; supplierId?: string; purchaseOrderId?: string; from?: Date; to?: Date; q?: string; page?: number; limit?: number } = {},
): Promise<OpResult<{ items: ReceiptSummary[]; total: number; page: number; limit: number }>> {
  const denied = guard(ctx, 'purchasing', READ_PERMS);
  if (denied) return denied;
  const filter: Record<string, unknown> = { ...receiptScope(ctx) };
  if (q.status && ['draft', 'posted', 'cancelled'].includes(q.status)) filter.status = q.status;
  if (q.branchId && validId(q.branchId) && !scoped(ctx)) filter.branchId = oid(q.branchId);
  if (q.supplierId && validId(q.supplierId)) filter.supplierId = oid(q.supplierId);
  if (q.purchaseOrderId && validId(q.purchaseOrderId)) filter.purchaseOrderId = oid(q.purchaseOrderId);
  const range = dateRange(q.from, q.to);
  if (range) filter.createdAt = range;
  const rx = searchRegex(q.q);
  if (rx) filter.$or = [{ docNo: rx }, { supplierName: rx }, { supplierInvoiceNo: rx }, { 'lines.name': rx }];
  const { skip, limit, page } = pageArgs(q);
  const [list, total] = await Promise.all([
    ctx.m.GoodsReceipt.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean<GoodsReceiptDoc[]>(),
    ctx.m.GoodsReceipt.countDocuments(filter),
  ]);
  const names = await branchNames(ctx, list.map((r) => r.branchId));
  const prices = canViewPrices(ctx);
  return ok({
    items: list.map((r) => ({
      id: String(r._id), docNo: r.docNo, status: r.status, supplierName: r.supplierName ?? null,
      branchName: names.get(String(r.branchId)) ?? null, purchaseOrderNo: r.purchaseOrderNo ?? null,
      supplierInvoiceNo: r.supplierInvoiceNo || null, lines: r.lines?.length ?? 0, total: prices ? r.total ?? 0 : null,
      createdBy: r.createdBy, createdAt: iso(r.createdAt), postedAt: iso(r.postedAt),
    })),
    total, page, limit,
  });
}

export async function getReceipt(ctx: ProductionCtx, id: string): Promise<OpResult<{ receipt: ReceiptView }>> {
  const denied = guard(ctx, 'purchasing', READ_PERMS);
  if (denied) return denied;
  const loaded = await loadReceipt(ctx, id);
  if (!loaded.ok) return loaded;
  return ok({ receipt: await viewOf(ctx, loaded.data) });
}

export interface ReceiptPrint {
  shop: string;
  docNo: string;
  status: ReceiptStatus;
  date: string | null;
  supplier: { name: string; phone: string | null; company: string | null } | null;
  warehouse: string | null;
  supplierInvoiceNo: string | null;
  invoiceDate: string | null;
  lines: { n: number; name: string; code: string; qty: number; unit: ProductUnit | null; baseQty: number; baseUnit: ProductUnit | null; price: number | null; amount: number | null }[];
  total: number | null;
  paid: number | null;
  debt: number | null;
  receivedBy: string;
}

/** Chop etiladigan nakladnoy ma'lumoti (narxlar — huquq bo'lsa) */
export async function receiptPrintData(ctx: ProductionCtx, id: string): Promise<OpResult<ReceiptPrint>> {
  const got = await getReceipt(ctx, id);
  if (!got.ok) return got;
  const v = got.data.receipt;
  const s = v.supplierId ? await ctx.m.Supplier.findById(v.supplierId).setOptions({ withDeleted: true }).select('name phone company').lean() : null;
  return ok({
    shop: ctx.orgName,
    docNo: v.docNo,
    status: v.status,
    date: v.postedAt ?? v.createdAt,
    supplier: s ? { name: s.name, phone: s.phone ?? null, company: s.company ?? null } : v.supplierName ? { name: v.supplierName, phone: null, company: null } : null,
    warehouse: v.branchName,
    supplierInvoiceNo: v.supplierInvoiceNo,
    invoiceDate: v.invoiceDate,
    lines: v.lines.map((l, i) => ({ n: i + 1, name: l.name, code: l.code, qty: l.qty, unit: l.unit, baseQty: l.baseQty, baseUnit: l.baseUnit, price: l.price, amount: l.amount })),
    total: v.total,
    paid: v.paidNow,
    debt: v.debt,
    receivedBy: v.postedBy ?? v.createdBy,
  });
}

/* ───────────────────────────── PO → kirim qoralamasi ───────────────────────────── */

/** Xarid buyurtmasining qabul qilinmagan qatorlaridan kirim qoralamasi (narx — PO'dan) */
export async function receiptDraftFromPo(ctx: ProductionCtx, poId: string, clientId?: string): Promise<OpResult<{ receipt: ReceiptView; existing: boolean }>> {
  const denied = guard(ctx, 'purchasing', 'receipt.create');
  if (denied) return denied;
  const po = await loadPo(ctx, poId);
  if (!po) return fail(ctx.d, 'poNotFound');
  if (!poAllows(po.status, 'receive')) return fail(ctx.d, 'poClosed');
  const lines = po.lines.filter((l) => poRemaining(l) > 0).map((l) => ({
    productId: String(l.productId), qty: poRemaining(l), unit: l.unit ?? null, poLineId: String(l._id),
    ...(canViewPrices(ctx) ? { price: l.price ?? null } : {}),
  }));
  if (!lines.length) return fail(ctx.d, 'poClosed');
  return saveReceipt(ctx, null, { purchaseOrderId: String(po._id), lines, clientId });
}
