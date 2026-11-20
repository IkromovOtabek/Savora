import { NextResponse } from 'next/server';
import { reservationForm, toResResponse } from '@/lib/restaurant/reservations';
import { badRequest, noStore, parseInput, queryObject, resCtx } from '../_res';

/** Bron formasi ma'lumoti (reservation.manage): ?branchId= → { branchId, branches, halls, tables, menu } */
export async function GET(req: Request) {
  const a = await resCtx(req);
  if (a instanceof NextResponse) return a;
  const q = parseInput(a.s.branch, queryObject(req), a.ctx.d.restaurant.errors.badInput);
  if (!q.ok) return badRequest(q.error);
  return noStore(toResResponse(await reservationForm(a.ctx, { branchId: q.data.branchId })));
}
