import { NextResponse } from 'next/server';
import { listPos } from '@/lib/production/purchaseOrders';
import { toResponse } from '@/lib/production/session';
import { apiCtx, listArgs, noStore } from '../_shared';

/** Yetkazib beruvchiga buyurtmalar: ?status=open|draft|sent|partial|received|cancelled &branchId= &supplierId= &from= &to= &q= */
export async function GET(req: Request) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  return noStore(toResponse(await listPos(a.ctx, listArgs(a.q))));
}
