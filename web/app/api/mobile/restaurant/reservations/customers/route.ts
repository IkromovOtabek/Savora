import { NextResponse } from 'next/server';
import { searchReservationCustomers, toResResponse } from '@/lib/restaurant/reservations';
import { badRequest, noStore, parseInput, queryObject, resCtx } from '../_res';

/** Mijoz qidiruvi (reservation.manage): ?q= (2+ belgi; 3+ raqam — telefon bo'yicha) → { customers: [{ id, name, phone }] } */
export async function GET(req: Request) {
  const a = await resCtx(req);
  if (a instanceof NextResponse) return a;
  const q = parseInput(a.s.search, queryObject(req), a.ctx.d.restaurant.errors.badInput);
  if (!q.ok) return badRequest(q.error);
  const r = await searchReservationCustomers(a.ctx, q.data.q);
  return noStore(toResResponse(r.ok ? { ok: true, data: { customers: r.data } } : r));
}
