import { NextResponse } from 'next/server';
import { listOrders } from '@/lib/production/orders';
import { toResponse } from '@/lib/production/session';
import { apiCtx, listArgs, noStore } from '../_shared';

/** Ishlab chiqarish aktlari: ?status=active|draft|in_progress|done|cancelled &branchId= &recipeId= &from= &to= &q= &page= &limit= */
export async function GET(req: Request) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  return noStore(toResponse(await listOrders(a.ctx, listArgs(a.q))));
}
