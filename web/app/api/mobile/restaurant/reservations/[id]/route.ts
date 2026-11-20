import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonInput } from '@/lib/validation';
import {
  cancelReservation, getReservation, markNoShow, seatReservation, toResResponse, updateReservation,
} from '@/lib/restaurant/reservations';
import { badRequest, noStore, parseInput, resCtx, toInput } from '../_res';

type Params = { params: Promise<{ id: string }> };

/** Bitta bron → { reservation } */
export async function GET(req: Request, { params }: Params) {
  const a = await resCtx(req);
  if (a instanceof NextResponse) return a;
  const i = parseInput(a.s.id, await params, a.ctx.d.reservations.errors.reservationNotFound);
  if (!i.ok) return badRequest(i.error);
  return noStore(toResResponse(await getReservation(a.ctx, i.data.id)));
}

/**
 * Amallar: `{ op: 'update', ...ReservationInput }` · `{ op: 'cancel', reason? }` · `{ op: 'noShow' }` (reservation.manage) ·
 * `{ op: 'seat' }` («Keldi»: order.create yoki reservation.manage → SeatResult)
 */
export async function POST(req: Request, { params }: Params) {
  const a = await resCtx(req);
  if (a instanceof NextResponse) return a;
  const i = parseInput(a.s.id, await params, a.ctx.d.reservations.errors.reservationNotFound);
  if (!i.ok) return badRequest(i.error);
  const id = i.data.id;
  const bad = a.ctx.d.restaurant.errors.badInput;
  const schema = z.discriminatedUnion('op', [
    z.object({ op: z.literal('update') }).passthrough(),
    z.object({ op: z.literal('cancel'), reason: z.unknown().optional() }),
    z.object({ op: z.literal('noShow') }),
    z.object({ op: z.literal('seat') }),
  ]);
  const b = await readJsonInput(req, schema, { badJson: bad, fallback: bad });
  if (!b.ok) return badRequest(b.error);
  switch (b.data.op) {
    case 'update': {
      const p = parseInput(a.s.save, b.data, bad);
      if (!p.ok) return badRequest(p.error);
      return toResResponse(await updateReservation(a.ctx, id, toInput(p.data)));
    }
    case 'cancel': {
      const p = parseInput(a.s.cancel, { reason: b.data.reason }, bad);
      if (!p.ok) return badRequest(p.error);
      return toResResponse(await cancelReservation(a.ctx, id, p.data.reason));
    }
    case 'noShow':
      return toResResponse(await markNoShow(a.ctx, id));
    case 'seat':
      return toResResponse(await seatReservation(a.ctx, id));
  }
}
