import { NextResponse } from 'next/server';
import { parseInput } from '@/lib/validation';
import { publicCall } from '@/lib/restaurant/public';
import { restaurantSchemas } from '@/lib/restaurant/inputs';
import { errorResponse } from '@/lib/restaurant/session';
import { headersFor, LIMITS, publicTable } from '../../../_shared';

type Params = { params: Promise<{ slug: string; token: string }> };

/** «Ofitsantni chaqirish» / «Hisob so'rash»: { kind: 'waiter' | 'bill' } */
export async function POST(req: Request, { params }: Params) {
  const a = await publicTable(req, params, (ip, token) => [LIMITS.callIp(ip), LIMITS.callTable(token)]);
  if (a instanceof NextResponse) return a;
  const bad = a.d.restaurant.errors.badInput;
  let body: unknown;
  try { body = await req.json(); } catch { return headersFor(NextResponse.json({ error: bad, code: 'badInput' }, { status: 400 })); }
  const p = parseInput(restaurantSchemas(a.d.restaurant.errors).publicCall, body, bad);
  if (!p.ok) return headersFor(NextResponse.json({ error: p.error, code: 'badInput' }, { status: 400 }));
  const r = await publicCall(a.c, p.data.kind);
  return headersFor(r.ok ? NextResponse.json(r.data) : errorResponse(r));
}
