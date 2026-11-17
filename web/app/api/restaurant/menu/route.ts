import { NextResponse } from 'next/server';
import { staffMenu } from '@/lib/restaurant/queries';
import { toResponse } from '@/lib/restaurant/session';
import { apiCtx, noStore } from '../_shared';

/** Xodim menyusi (ofitsant/kassa/stop-list): kategoriya, narx, rasm, modifikatorlar, stop-list, qoldiq */
export async function GET(req: Request) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  return noStore(toResponse(await staffMenu(a.ctx, { branchId: a.q.branchId })));
}
