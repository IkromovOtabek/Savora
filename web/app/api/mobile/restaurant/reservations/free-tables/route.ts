import { NextResponse } from 'next/server';
import { freeTables, toResResponse } from '@/lib/restaurant/reservations';
import { reservationStart } from '@/lib/restaurant/reservationRules';
import { badRequest, noStore, parseInput, queryObject, resCtx } from '../_res';

/**
 * Shu vaqtda bo'sh stollar (reservation.manage): ?date=YYYY-MM-DD&time=HH:MM&durationMin=&guests=&branchId=&excludeId=
 * → { tables: FreeTable[] } (mosi birinchi)
 */
export async function GET(req: Request) {
  const a = await resCtx(req);
  if (a instanceof NextResponse) return a;
  const q = parseInput(a.s.free, queryObject(req), a.ctx.d.restaurant.errors.badInput);
  if (!q.ok) return badRequest(q.error);
  const start = reservationStart(q.data.date, q.data.time);
  if (!start) return badRequest(a.ctx.d.reservations.errors.badTime);
  const r = await freeTables(a.ctx, q.data.branchId, start, q.data.durationMin, q.data.guests, { excludeId: q.data.excludeId });
  return noStore(toResResponse(r.ok ? { ok: true, data: { tables: r.data } } : r));
}
