import { NextResponse } from 'next/server';
import { readJsonInput } from '@/lib/validation';
import { createReservation, listReservations, toResResponse } from '@/lib/restaurant/reservations';
import { badRequest, noStore, parseInput, queryObject, resCtx, toInput } from './_res';

/** Kun bo'yicha bronlar: ?date=YYYY-MM-DD (yo'q — bugun) &branchId= → ReservationsDay */
export async function GET(req: Request) {
  const a = await resCtx(req);
  if (a instanceof NextResponse) return a;
  const q = parseInput(a.s.list, queryObject(req), a.ctx.d.restaurant.errors.badInput);
  if (!q.ok) return badRequest(q.error);
  return noStore(toResResponse(await listReservations(a.ctx, { date: q.data.date, branchId: q.data.branchId })));
}

/** Yangi bron (reservation.manage): ReservationInput → { reservation } */
export async function POST(req: Request) {
  const a = await resCtx(req);
  if (a instanceof NextResponse) return a;
  const bad = a.ctx.d.restaurant.errors.badInput;
  const b = await readJsonInput(req, a.s.save, { badJson: bad, fallback: bad });
  if (!b.ok) return badRequest(b.error);
  const r = await createReservation(a.ctx, toInput(b.data));
  return r.ok ? NextResponse.json(r.data, { status: 201 }) : toResResponse(r);
}
