import { NextResponse } from 'next/server';
import { restaurantSetupView } from '@/lib/restaurant/queries';
import { toResponse } from '@/lib/restaurant/session';
import { apiCtx, noStore } from '../_shared';

/** Restoran sozlamalari sahifasi ma'lumoti (tables.manage): sozlamalar, zallar, stollar (QR), stansiyalar */
export async function GET(req: Request) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  return noStore(toResponse(await restaurantSetupView(a.ctx, { branchId: a.q.branchId })));
}
