import { NextResponse } from 'next/server';
import { parseInput } from '@/lib/validation';
import { restaurantCtxFromApi } from '@/lib/restaurant/session';
import { restaurantSchemas, searchParamsObject } from '@/lib/restaurant/inputs';
import type { RestaurantCtx } from '@/lib/restaurant/context';

/**
 * Web JSON API (polling) umumiy qismi: sessiya (cookie) + `?branchId=&stationId=&since=&status=&type=`.
 * Javoblar keshlanmaydi (`no-store`).
 */
export async function apiCtx(req: Request): Promise<
  | { ctx: RestaurantCtx; q: { branchId?: string; stationId?: string; since?: Date; status?: 'active' | 'closed' | 'all'; type?: 'dine_in' | 'takeaway' | 'qr_self' } }
  | NextResponse
> {
  const ctx = await restaurantCtxFromApi();
  if (ctx instanceof NextResponse) return ctx;
  const s = restaurantSchemas(ctx.d.restaurant.errors);
  const p = parseInput(s.query, searchParamsObject(new URL(req.url).searchParams), ctx.d.restaurant.errors.badInput);
  if (!p.ok) return NextResponse.json({ error: p.error, code: 'badInput' }, { status: 400 });
  return { ctx, q: p.data };
}

export function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
