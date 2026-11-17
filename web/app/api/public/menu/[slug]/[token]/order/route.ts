import { NextResponse } from 'next/server';
import { parseInput } from '@/lib/validation';
import { publicOrderStatus, publicPlaceOrder } from '@/lib/restaurant/public';
import { restaurantSchemas } from '@/lib/restaurant/inputs';
import { errorResponse } from '@/lib/restaurant/session';
import { headersFor, LIMITS, publicTable } from '../../../_shared';

type Params = { params: Promise<{ slug: string; token: string }> };

/** Stoldagi ochiq buyurtma holati (mijoz «Buyurtmangiz») */
export async function GET(req: Request, { params }: Params) {
  const a = await publicTable(req, params, (ip) => [LIMITS.read(ip)]);
  if (a instanceof NextResponse) return a;
  return headersFor(NextResponse.json(await publicOrderStatus(a.c)));
}

/**
 * Mijoz buyurtmasi: { clientOrderId, items: [{ productId, qty, optionIds?, note? }] }.
 * Taomlar `pending` — ofitsant tasdiqlamaguncha oshxonaga ketmaydi. Takroriy yuborish (shu clientOrderId) — qayta yozilmaydi.
 */
export async function POST(req: Request, { params }: Params) {
  const a = await publicTable(req, params, (ip, token) => [LIMITS.orderIp(ip), LIMITS.orderTable(token)]);
  if (a instanceof NextResponse) return a;
  const bad = a.d.restaurant.errors.badInput;
  let body: unknown;
  try { body = await req.json(); } catch { return headersFor(NextResponse.json({ error: bad, code: 'badInput' }, { status: 400 })); }
  const p = parseInput(restaurantSchemas(a.d.restaurant.errors).publicOrder, body, bad);
  if (!p.ok) return headersFor(NextResponse.json({ error: p.error, code: 'badInput' }, { status: 400 }));
  const r = await publicPlaceOrder(a.c, p.data);
  if (!r.ok) return headersFor(errorResponse(r));
  return headersFor(NextResponse.json(r.data, { status: 201 }));
}
