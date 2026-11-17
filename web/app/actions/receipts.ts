'use server';

/**
 * Kirim akti, yetkazib beruvchiga buyurtma (xarid) va mahsulotning ombor sozlamalari (xarid birligi, minimal qoldiq)
 * — server action'lar (web). Natija shakli app/actions/production.ts bilan bir xil. Hujjat: docs/SEX_API.md.
 */
import { revalidatePath } from 'next/cache';
import { parseInput } from '@/lib/validation';
import { tr } from '@/lib/i18n/fmt';
import { productionCtxFromSession, toAction, type ActionResult } from '@/lib/production/session';
import { productionSchemas } from '@/lib/production/inputs';
import * as receipts from '@/lib/production/receipts';
import * as pos from '@/lib/production/purchaseOrders';
import * as catalog from '@/lib/production/catalog';

async function prep() {
  const ctx = await productionCtxFromSession();
  return { ctx, s: productionSchemas(ctx.d.production.errors), t: ctx.d.production };
}

function invalid(error: string): { ok: false; error: string; code: 'badInput' } {
  return { ok: false, error, code: 'badInput' };
}

function revalidateStock() {
  revalidatePath('/app/receipts');
  revalidatePath('/app/products');
  revalidatePath('/app/suppliers');
}

/* ───────────────────────────── kirim akti ───────────────────────────── */

/**
 * Kirim akti: `id` yo'q — yangi qoralama (`clientId` — takroriy bosishdan), bor — qoralamani tahrirlash.
 * Qator: `{ productId, qty, unit?, price?, expiryDate?, poLineId? }` — `unit` asosiy yoki xarid birligi; `price` — shu
 * birlik narxi (kelish narxini ko'rish huquqi bo'lmasa e'tiborsiz); `null` — narxni tozalash.
 */
export async function saveReceiptAction(id: string | null, input: receipts.ReceiptInput): Promise<ActionResult<{ receipt: receipts.ReceiptView; existing: boolean }>> {
  const { ctx, s, t } = await prep();
  if (id) {
    const idp = parseInput(s.id, { id }, t.errors.receiptNotFound);
    if (!idp.ok) return invalid(idp.error);
  }
  const p = parseInput(s.receipt, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await receipts.saveReceipt(ctx, id, {
    ...p.data,
    lines: p.data.lines.map((l) => ({ productId: l.productId, qty: l.qty, unit: l.unit ?? null, price: l.price, expiryDate: l.expiryDate, poLineId: l.poLineId })),
  });
  if (r.ok) revalidatePath('/app/receipts');
  return toAction(r, r.ok && !r.data.existing ? t.msg.receiptSaved : undefined);
}

/** Kirim qilish (post): ombor + o'rtacha tannarx + yetkazib beruvchi qarzi (+ `paidNow` to'lovi) + PO */
export async function postReceiptAction(id: string, input: { paidNow?: number } = {}): Promise<ActionResult<{ receipt: receipts.ReceiptView; created: string[] }>> {
  const { ctx, s, t } = await prep();
  const idp = parseInput(s.id, { id }, t.errors.receiptNotFound);
  if (!idp.ok) return invalid(idp.error);
  const p = parseInput(s.receiptPost, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await receipts.postReceipt(ctx, idp.data.id, p.data);
  if (r.ok) {
    revalidateStock();
    revalidatePath('/app/purchase-orders');
  }
  return toAction(r, r.ok ? tr(t.msg.receiptPosted, { no: r.data.receipt.docNo, n: r.data.receipt.lines.length }) : undefined);
}

export async function cancelReceiptAction(id: string): Promise<ActionResult<{ receipt: receipts.ReceiptView }>> {
  const { ctx, s, t } = await prep();
  const idp = parseInput(s.id, { id }, t.errors.receiptNotFound);
  if (!idp.ok) return invalid(idp.error);
  const r = await receipts.cancelReceipt(ctx, idp.data.id);
  if (r.ok) revalidatePath('/app/receipts');
  return toAction(r, t.msg.receiptCancelled);
}

/* ───────────────────────────── yetkazib beruvchiga buyurtma ───────────────────────────── */

/** Xarid buyurtmasi: `id` yo'q — yangi, bor — tahrir (draft/sent, hali qabul bo'lmagan) */
export async function savePurchaseOrderAction(id: string | null, input: pos.PoInput): Promise<ActionResult<{ po: pos.PoView; existing: boolean }>> {
  const { ctx, s, t } = await prep();
  if (id) {
    const idp = parseInput(s.id, { id }, t.errors.poNotFound);
    if (!idp.ok) return invalid(idp.error);
  }
  const p = parseInput(s.po, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await pos.savePo(ctx, id, {
    ...p.data,
    lines: p.data.lines.map((l) => ({ productId: l.productId, qty: l.qty, unit: l.unit ?? null, price: l.price })),
  });
  if (r.ok) revalidatePath('/app/purchase-orders');
  return toAction(r, r.ok && !r.data.existing ? t.msg.poSaved : undefined);
}

export async function sendPurchaseOrderAction(id: string): Promise<ActionResult<{ po: pos.PoView }>> {
  const { ctx, s, t } = await prep();
  const idp = parseInput(s.id, { id }, t.errors.poNotFound);
  if (!idp.ok) return invalid(idp.error);
  const r = await pos.sendPo(ctx, idp.data.id);
  if (r.ok) revalidatePath('/app/purchase-orders');
  return toAction(r, t.msg.poSent);
}

export async function cancelPurchaseOrderAction(id: string): Promise<ActionResult<{ po: pos.PoView }>> {
  const { ctx, s, t } = await prep();
  const idp = parseInput(s.id, { id }, t.errors.poNotFound);
  if (!idp.ok) return invalid(idp.error);
  const r = await pos.cancelPo(ctx, idp.data.id);
  if (r.ok) revalidatePath('/app/purchase-orders');
  return toAction(r, t.msg.poCancelled);
}

/** Qabul: buyurtmaning qolgan qatorlaridan kirim qoralamasi (keyin `postReceiptAction`) */
export async function receiveFromPurchaseOrderAction(id: string, input: { clientId?: string } = {}): Promise<ActionResult<{ receipt: receipts.ReceiptView; existing: boolean }>> {
  const { ctx, s, t } = await prep();
  const idp = parseInput(s.id, { id }, t.errors.poNotFound);
  if (!idp.ok) return invalid(idp.error);
  const cid = typeof input.clientId === 'string' && /^[A-Za-z0-9:_-]{8,64}$/.test(input.clientId) ? input.clientId : undefined;
  const r = await receipts.receiptDraftFromPo(ctx, idp.data.id, cid);
  if (r.ok) revalidatePath('/app/receipts');
  return toAction(r, r.ok ? tr(t.msg.poReceiptDraft, { no: r.data.receipt.docNo }) : undefined);
}

/* ───────────────────────────── mahsulotning ombor sozlamalari ───────────────────────────── */

/**
 * Minimal qoldiq (`minStock`, null — olib tashlash), xarid birligi va koeffitsient (`purchaseUnit` + `purchaseFactor`,
 * masalan 'qop' + 50 → 1 qop = 50 kg; `purchaseUnit: null` — olib tashlash). Huquq: `product.edit`.
 */
export async function setStockSettingsAction(input: catalog.StockSettingsInput): Promise<ActionResult<{ product: catalog.ProductOption; updatedCopies: number }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.stockSettings, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await catalog.setStockSettings(ctx, p.data);
  if (r.ok) {
    revalidatePath('/app/products');
    revalidatePath(`/app/products/${p.data.productId}`);
  }
  return toAction(r, t.msg.stockSettingsSaved);
}
