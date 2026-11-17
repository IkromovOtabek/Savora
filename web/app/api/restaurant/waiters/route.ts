import { NextResponse } from 'next/server';
import { waitersList } from '@/lib/restaurant/queries';
import { toResponse } from '@/lib/restaurant/session';
import { apiCtx, noStore } from '../_shared';

/** O'tkazish uchun xodimlar (order.transfer) */
export async function GET(req: Request) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  return noStore(toResponse(await waitersList(a.ctx, { branchId: a.q.branchId })));
}
