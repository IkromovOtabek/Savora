import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOrder } from '@/lib/restaurant/queries';
import { addItems, bumpItems, cancelOrder, confirmPendingItems, precheckOrder, sendItems, updateOrderInfo, voidItem } from '@/lib/restaurant/ops';
import { toResponse } from '@/lib/restaurant/session';
import { zId } from '@/lib/validation';
import { badRequest, bodyOf, mobileCtx, noStore } from '../../_shared';

type Params = { params: Promise<{ id: string }> };

/** Bitta buyurtma (taomlar, hisob, `can`, `requireVoidReason`, `hallName`) + `serverTime` (telefon soati farqi) */
export async function GET(req: Request, { params }: Params) {
  const a = await mobileCtx(req);
  if (a instanceof NextResponse) return a;
  const { id } = await params;
  return noStore(toResponse(await getOrder(a.ctx, id)));
}

/**
 * Buyurtma amallari — { op, ... }:
 *   addItems  { items: [{ clientItemId?, productId, qty, optionIds?, note? }] }  (clientItemId — idempotent)
 *   send      { itemIds? }                     — oshxonaga yuborish (ombor band qilinadi)
 *   served    { itemIds }                      — yetkazildi
 *   void      { itemId, qty?, reason? }        — bekor qilish
 *   confirm   { itemIds?, reject?, send? }     — mijoz QR taomlari
 *   precheck  {}                               — hisob (pre-chek)
 *   info      { guests?, note?, forTableId? }      — forTableId: saboyning stoli (null — olib tashlash)
 *   cancel    { reason? }                      — buyurtmani bekor qilish (oshxonaga yuborilgan faol taom va to'lov bo'lmasa)
 * To'lov mobil ilovada yo'q (kassa — web).
 */
export async function POST(req: Request, { params }: Params) {
  const a = await mobileCtx(req);
  if (a instanceof NextResponse) return a;
  const { id } = await params;
  const { s, ctx } = a;
  const bad = ctx.d.restaurant.errors.badInput;
  const schema = z.discriminatedUnion('op', [
    z.object({ op: z.literal('addItems'), items: s.addItems.shape.items }),
    z.object({ op: z.literal('send'), itemIds: s.send.shape.itemIds }),
    z.object({ op: z.literal('served'), itemIds: z.array(zId(bad)).min(1, bad).max(200, bad) }),
    z.object({ op: z.literal('void'), itemId: s.voidItem.shape.itemId, qty: s.voidItem.shape.qty, reason: s.voidItem.shape.reason }),
    z.object({ op: z.literal('confirm'), itemIds: s.confirm.shape.itemIds, reject: s.confirm.shape.reject, send: s.confirm.shape.send }),
    z.object({ op: z.literal('precheck') }),
    z.object({ op: z.literal('info'), guests: s.info.shape.guests, note: s.info.shape.note, forTableId: s.info.shape.forTableId }),
    z.object({ op: z.literal('cancel'), reason: s.cancel.shape.reason }),
  ]);
  const b = await bodyOf(req, schema, a);
  if (!b.ok) return badRequest(b.error);
  const d = b.data;
  switch (d.op) {
    case 'addItems': return toResponse(await addItems(ctx, id, d.items));
    case 'send': return toResponse(await sendItems(ctx, id, d.itemIds));
    case 'served': return toResponse(await bumpItems(ctx, id, { itemIds: d.itemIds, to: 'served' }));
    case 'void': return toResponse(await voidItem(ctx, id, { itemId: d.itemId, qty: d.qty, reason: d.reason }));
    case 'confirm': return toResponse(await confirmPendingItems(ctx, id, { itemIds: d.itemIds, reject: d.reject, send: d.send }));
    case 'precheck': return toResponse(await precheckOrder(ctx, id));
    case 'info': return toResponse(await updateOrderInfo(ctx, id, { guests: d.guests === undefined ? undefined : d.guests || null, note: d.note, forTableId: d.forTableId }));
    case 'cancel': return toResponse(await cancelOrder(ctx, id, d.reason || undefined));
  }
}
