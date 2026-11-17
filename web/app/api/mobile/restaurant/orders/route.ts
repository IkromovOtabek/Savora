import { NextResponse } from 'next/server';
import { listOrders } from '@/lib/restaurant/queries';
import { openOrder } from '@/lib/restaurant/ops';
import { toResponse } from '@/lib/restaurant/session';
import { badRequest, bodyOf, mobileCtx, noStore, queryOf } from '../_shared';

/** Buyurtmalar: ?status=active|closed|all &type= &since=<ISO> */
export async function GET(req: Request) {
  const a = await mobileCtx(req);
  if (a instanceof NextResponse) return a;
  const q = queryOf(req, a);
  if (!q.ok) return badRequest(q.error);
  return noStore(toResponse(await listOrders(a.ctx, q.data)));
}

/**
 * Stol ochish / saboy: { type: 'dine_in'|'takeaway', tableId?, branchId?, guests?, note?, clientOrderId?, items? }.
 * Stolda ochiq buyurtma bo'lsa — o'sha qaytadi (`existing: true`). `clientOrderId` — takroriy yuborishdan himoya.
 */
export async function POST(req: Request) {
  const a = await mobileCtx(req);
  if (a instanceof NextResponse) return a;
  const b = await bodyOf(req, a.s.openOrder, a);
  if (!b.ok) return badRequest(b.error);
  return toResponse(await openOrder(a.ctx, b.data));
}
