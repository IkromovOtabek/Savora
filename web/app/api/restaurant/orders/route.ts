import { NextResponse } from 'next/server';
import { listOrders } from '@/lib/restaurant/queries';
import { toResponse } from '@/lib/restaurant/session';
import { apiCtx, noStore } from '../_shared';

/** Buyurtmalar ro'yxati: ?status=active|closed|all &type= &since=<ISO> (since — faqat o'zgarganlar, holatidan qat'i nazar) */
export async function GET(req: Request) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  return noStore(toResponse(await listOrders(a.ctx, a.q)));
}
