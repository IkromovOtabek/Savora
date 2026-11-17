import { NextResponse } from 'next/server';
import { staffMenu } from '@/lib/restaurant/queries';
import { toResponse } from '@/lib/restaurant/session';
import { badRequest, mobileCtx, noStore, queryOf } from '../_shared';

/** Ofitsant menyusi: kategoriyalar, taomlar (narx, rasm, modifikatorlar, stop-list, qoldiq) */
export async function GET(req: Request) {
  const a = await mobileCtx(req);
  if (a instanceof NextResponse) return a;
  const q = queryOf(req, a);
  if (!q.ok) return badRequest(q.error);
  return noStore(toResponse(await staffMenu(a.ctx, { branchId: q.data.branchId })));
}
