import { NextResponse } from 'next/server';
import { lowStockList } from '@/lib/production/catalog';
import { toResponse } from '@/lib/production/session';
import { apiCtx, noStore } from '../_shared';

/** Minimal qoldiqdan kam mahsulotlar: ?branchId= (admin; filial xodimi — o'z filiali) */
export async function GET(req: Request) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  return noStore(toResponse(await lowStockList(a.ctx, { branchId: a.q.branchId })));
}
