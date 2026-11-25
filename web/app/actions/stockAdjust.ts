'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Types } from 'mongoose';
import { getTenantSession } from '@/lib/tenantSession';
import { recordAudit } from '@/lib/audit';
import { featureDisabledError } from '@/lib/featureAction';
import { checkPermission } from '@/lib/permissionGuard';
import { branchFilter, isBranchScoped } from '@/lib/branchScope';
import { nextDocNo } from '@/lib/counters';
import { runWithCompensation } from '@/lib/compensate';
import { planWriteOff, planWriteOffUndo } from '@/lib/stockAdjust';
import { logError } from '@/lib/logger';
import { parseInput, zId, zMoney, zOneOf, zOptQty, zText } from '@/lib/validation';
import { fmtQty, priceTimesQty, qtyLabel } from '@/lib/qty';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import type { IProduct } from '@/lib/models/tenant/Product';
import type { IStockAdjustmentItem } from '@/lib/models/tenant/StockAdjustment';

type State = { error?: string; success?: string } | null;
type ProductLean = IProduct & { _id: Types.ObjectId };

const MAX_LINES = 200;

export interface RevaluationInput {
  lines: { productId: string; newSalePrice: number; newWholesalePrice?: number }[];
  note?: string;
}

export async function revaluationAction(input: RevaluationInput): Promise<State> {
  const { user, features, Product, StockAdjustment } = await getTenantSession();
  if (!features.products) return featureDisabledError('products');
  const denied = await checkPermission(user, 'stock.adjust');
  if (denied) return denied;
  const k = (await getDict()).stock.adjust;

  const parsed = parseInput(z.object({
    lines: z.array(z.object({
      productId: zId(k.noLines),
      newSalePrice: zMoney(k.badPrice, { min: 1 }),
      newWholesalePrice: zMoney(k.badPrice, { optional: true }),
    })).min(1, k.noLines).max(MAX_LINES, k.noLines),
    note: zText(300),
  }), input, k.noLines);
  if (!parsed.ok) return { error: parsed.error };
  const { lines, note } = parsed.data;
  const scope = branchFilter(user);
  const at = new Date();

  let failName: string | null = null;
  const outcome = await runWithCompensation(lines, async (line) => {
    const wholesale = line.newWholesalePrice > 0 ? line.newWholesalePrice : undefined;
    const update = wholesale !== undefined
      ? { $set: { salePrice: line.newSalePrice, wholesalePrice: wholesale } }
      : { $set: { salePrice: line.newSalePrice }, $unset: { wholesalePrice: '' } };
    // new:false — eski narxlar kerak (hujjat va bekor qilish uchun)
    const before = await Product.findOneAndUpdate(
      { _id: line.productId, ...scope, status: 'in_stock' },
      { ...update, $push: { history: { action: 'revalued', detail: `→ ${fmtMoney(line.newSalePrice)} so'm`, by: user.username, at } } },
      { new: false },
    ).lean<ProductLean>();
    if (!before) {
      failName = (await Product.findById(line.productId).select('name').lean<{ name: string }>())?.name ?? line.productId;
      return null;
    }
    const item: IStockAdjustmentItem = {
      productId: before._id,
      name: before.name,
      oldSalePrice: before.salePrice,
      newSalePrice: line.newSalePrice,
      oldWholesalePrice: before.wholesalePrice,
      newWholesalePrice: wholesale,
    };
    const undo = async () => {
      await Product.updateOne({ _id: before._id }, {
        $set: { salePrice: before.salePrice, ...(before.wholesalePrice !== undefined ? { wholesalePrice: before.wholesalePrice } : {}) },
        ...(before.wholesalePrice === undefined ? { $unset: { wholesalePrice: '' } } : {}),
        $pop: { history: 1 },
      });
    };
    return { result: { item, undo }, undo };
  });
  if (!outcome.ok) {
    if (outcome.error) logError('revaluationAction failed', outcome.error, { user: user.username, dbName: user.dbName });
    return { error: failName ? tr(k.notFound, { name: failName }) : k.failed };
  }

  const items = outcome.results.map((r) => r.item);
  try {
    const docNo = await nextDocNo(StockAdjustment, 'docNo', 'stockadj', 'QB');
    const doc = await StockAdjustment.create({
      docNo, type: 'revaluation', note: note || undefined, items, totalCost: 0, by: user.username,
      ...(isBranchScoped(user) ? { branchId: user.branchId } : {}),
    });
    await recordAudit(user, {
      action: 'stock.revaluation',
      entity: 'product',
      entityId: String(doc._id),
      summary: `Qayta baholash ${docNo}: ${items.length} ta mahsulot — ${items.slice(0, 3).map((i) => `${i.name} ${fmtMoney(i.oldSalePrice ?? 0)} → ${fmtMoney(i.newSalePrice ?? 0)}`).join('; ')}${items.length > 3 ? '…' : ''}`,
      meta: { docNo, count: items.length },
    });
    revalidatePath('/app/revaluation');
    revalidatePath('/app/products');
    return { success: tr(k.doneReval, { no: docNo, n: items.length }) };
  } catch (e) {
    logError('revaluation doc failed', e, { user: user.username, dbName: user.dbName });
    // Hujjat yozilmadi — narxlar ham qaytariladi (iz qolmasin)
    for (const r of outcome.results) await r.undo().catch(() => {});
    return { error: k.failed };
  }
}

export interface WriteOffInput {
  lines: { productId: string; qty: number }[];
  /** offcut — bichim qoldig'i/chiqindi (sex); production_scrap — faqat ishlab chiqarish akti yozadi */
  reason: 'defective' | 'lost' | 'expired' | 'other' | 'offcut';
  note?: string;
}

export async function writeOffAction(input: WriteOffInput): Promise<State> {
  const { user, features, Product, StockAdjustment } = await getTenantSession();
  if (!features.products) return featureDisabledError('products');
  const denied = await checkPermission(user, 'stock.writeOff');
  if (denied) return denied;
  const d = await getDict();
  const k = d.stock.adjust;

  const parsed = parseInput(z.object({
    lines: z.array(z.object({ productId: zId(k.noLines), qty: zOptQty(k.badQty) }))
      .min(1, k.noLines).max(MAX_LINES, k.noLines),
    reason: zOneOf(['defective', 'lost', 'expired', 'other', 'offcut'] as const, k.reason),
    note: zText(300),
  }), input, k.noLines);
  if (!parsed.ok) return { error: parsed.error };
  const { lines, reason, note } = parsed.data;
  const scope = branchFilter(user);
  const at = new Date();
  const reasonLabel = k.reasons[reason];

  let fail: string | null = null;
  const outcome = await runWithCompensation(lines, async (line) => {
    // Xizmat/to'plamni hisobdan chiqarib bo'lmaydi (o'z qoldig'i yo'q)
    const p = await Product.findOne({ _id: line.productId, ...scope, status: 'in_stock', kind: { $nin: ['service', 'bundle'] } }).lean<ProductLean>();
    if (!p) { fail = tr(k.notFound, { name: line.productId }); return null; }
    const qty = p.trackQuantity ? (line.qty ?? 1) : 1;
    const plan = planWriteOff(p, qty);
    if (!plan.ok) { fail = `${p.name}: ${k.badQty}`; return null; }

    // Optimistik tekshiruv: shu orada sotilgan/o'zgargan bo'lsa — yangilanmaydi
    const res = await Product.updateOne(
      {
        _id: p._id, status: 'in_stock',
        ...(p.trackQuantity ? { trackQuantity: true, quantity: p.quantity, soldQuantity: p.soldQuantity } : { trackQuantity: { $ne: true } }),
      },
      { $set: plan.set, $push: { history: { action: 'writtenOff', detail: `${qtyLabel(qty, p.unit)} · ${reasonLabel}`, by: user.username, at } } },
    );
    if (res.modifiedCount !== 1) { fail = tr(k.changed, { name: p.name }); return null; }

    const item: IStockAdjustmentItem = { productId: p._id, name: p.name, qty, purchasePrice: p.purchasePrice };
    const undo = async () => {
      await Product.updateOne({ _id: p._id }, { $set: { quantity: p.quantity, status: p.status }, $pop: { history: 1 } });
    };
    return { result: { item, undo }, undo };
  });
  if (!outcome.ok) {
    if (outcome.error) logError('writeOffAction failed', outcome.error, { user: user.username, dbName: user.dbName });
    return { error: fail ?? k.failed };
  }

  const items = outcome.results.map((r) => r.item);
  const totalCost = items.reduce((s, i) => s + priceTimesQty(i.purchasePrice ?? 0, i.qty ?? 0), 0);
  try {
    const docNo = await nextDocNo(StockAdjustment, 'docNo', 'stockadj', 'HC');
    const doc = await StockAdjustment.create({
      docNo, type: 'writeoff', reason, note: note || undefined, items, totalCost, by: user.username,
      ...(isBranchScoped(user) ? { branchId: user.branchId } : {}),
    });
    await recordAudit(user, {
      action: 'stock.writeoff',
      entity: 'product',
      entityId: String(doc._id),
      summary: `Hisobdan chiqarish ${docNo} (${reasonLabel}): ${items.map((i) => `${i.name} × ${fmtQty(i.qty ?? 0)}`).slice(0, 4).join(', ')}${items.length > 4 ? '…' : ''} — zarar ${fmtMoney(totalCost)} so'm`,
      meta: { docNo, reason, totalCost, count: items.length },
    });
    revalidatePath('/app/write-off');
    revalidatePath('/app/products');
    revalidatePath('/app/pos');
    return { success: tr(k.doneWo, { no: docNo, n: items.length }) };
  } catch (e) {
    logError('writeoff doc failed', e, { user: user.username, dbName: user.dbName });
    // Hujjat yozilmadi — mahsulotlar ham avvalgi holatiga qaytariladi
    for (const r of outcome.results) await r.undo().catch(() => {});
    return { error: k.failed };
  }
}

/**
 * Ombor hujjatini bekor qilish (qayta baholash yoki hisobdan chiqarish): mahsulotlar avvalgi holatiga
 * qaytadi, hujjat tarixda «Bekor qilingan» bo'lib qoladi. «Hammasi yoki hech biri»: shu orada o'zgargan
 * mahsulot (sotilgan, narxi qayta o'zgargan) bo'lsa — hech narsa o'zgarmaydi. Huquq — yaratish bilan bir xil.
 */
export async function cancelStockAdjustmentAction(_prev: State, formData: FormData): Promise<State> {
  const { user, features, Product, StockAdjustment } = await getTenantSession();
  if (!features.products) return featureDisabledError('products');
  const k = (await getDict()).stock.adjust;
  const parsed = parseInput(zId(k.failed), formData.get('docId'));
  if (!parsed.ok) return { error: parsed.error };
  const doc = await StockAdjustment.findOne({
    _id: parsed.data, cancelledAt: { $exists: false },
    ...(isBranchScoped(user) ? { branchId: user.branchId } : {}),
  }).lean();
  if (!doc) return { error: k.failed };
  const denied = await checkPermission(user, doc.type === 'writeoff' ? 'stock.writeOff' : 'stock.adjust');
  if (denied) return denied;
  if (doc.reason === 'production_scrap') return { error: k.cancelScrap };

  const scope = branchFilter(user);
  const at = new Date();
  // Avval hujjat atomik «band qilinadi» — parallel bosishda ikki marta qaytarilmaydi
  const claimed = await StockAdjustment.updateOne({ _id: doc._id, cancelledAt: { $exists: false } }, { $set: { cancelledAt: at, cancelledBy: user.username } });
  if (claimed.modifiedCount !== 1) return { error: k.failed };
  const release = () => StockAdjustment.updateOne({ _id: doc._id }, { $unset: { cancelledAt: '', cancelledBy: '' } });

  let fail: string | null = null;
  const outcome = await runWithCompensation(doc.items, async (it) => {
    const p = await Product.findOne({ _id: it.productId, ...scope }).lean<ProductLean>();
    if (!p) { fail = tr(k.cancelChanged, { name: it.name }); return null; }
    // Tarix: mavjud amal turlari (enum) — chiqarish bekori «qaytarildi», narx bekori «qayta baholandi»
    const history = doc.type === 'writeoff'
      ? { action: 'returned', detail: `${doc.docNo} bekor qilindi · ${qtyLabel(it.qty ?? 1, p.unit)}`, by: user.username, at }
      : { action: 'revalued', detail: `${doc.docNo} bekor qilindi → ${fmtMoney(it.oldSalePrice ?? 0)} so'm`, by: user.username, at };
    if (doc.type === 'revaluation') {
      // Narx faqat hujjatdagi yangi narxda turgan bo'lsa qaytadi (keyin yana o'zgartirilgan bo'lsa — yo'q)
      const res = await Product.updateOne(
        { _id: p._id, salePrice: it.newSalePrice },
        {
          $set: { salePrice: it.oldSalePrice ?? 0, ...(it.oldWholesalePrice !== undefined ? { wholesalePrice: it.oldWholesalePrice } : {}) },
          ...(it.oldWholesalePrice === undefined ? { $unset: { wholesalePrice: '' } } : {}),
          $push: { history },
        },
      );
      if (res.modifiedCount !== 1) { fail = tr(k.cancelChanged, { name: it.name }); return null; }
      return {
        result: it,
        undo: async () => { await Product.updateOne({ _id: p._id }, { $set: { salePrice: p.salePrice, ...(p.wholesalePrice !== undefined ? { wholesalePrice: p.wholesalePrice } : {}) }, $pop: { history: 1 } }); },
      };
    }
    const plan = planWriteOffUndo(p, it.qty ?? 1);
    if (!plan.ok) { fail = tr(k.cancelChanged, { name: it.name }); return null; }
    const res = await Product.updateOne({ _id: p._id, ...plan.filter }, { ...plan.update, $push: { history } });
    if (res.modifiedCount !== 1) { fail = tr(k.cancelChanged, { name: it.name }); return null; }
    return {
      result: it,
      undo: async () => { await Product.updateOne({ _id: p._id }, { $set: { quantity: p.quantity, status: p.status }, $pop: { history: 1 } }); },
    };
  });
  if (!outcome.ok) {
    if (outcome.error) logError('cancelStockAdjustment failed', outcome.error, { user: user.username, dbName: user.dbName });
    await release();
    return { error: fail ?? k.failed };
  }
  await recordAudit(user, {
    action: doc.type === 'writeoff' ? 'stock.writeoffCancel' : 'stock.revaluationCancel',
    entity: 'product',
    entityId: String(doc._id),
    summary: `${doc.docNo} bekor qilindi: ${doc.items.length} ta mahsulot avvalgi holatiga qaytarildi${doc.type === 'writeoff' ? ` (zarar ${fmtMoney(doc.totalCost)} so'm qaytdi)` : ''}`,
    meta: { docNo: doc.docNo, type: doc.type },
  });
  revalidatePath(doc.type === 'writeoff' ? '/app/write-off' : '/app/revaluation');
  revalidatePath('/app/products');
  revalidatePath('/app/pos');
  return { success: tr(k.doneCancel, { no: doc.docNo }) };
}
