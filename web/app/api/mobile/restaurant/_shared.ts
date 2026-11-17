import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { readJsonInput, parseInput } from '@/lib/validation';
import { restaurantCtxFromMobile } from '@/lib/restaurant/session';
import { restaurantSchemas, searchParamsObject, type RestaurantSchemas } from '@/lib/restaurant/inputs';
import type { RestaurantCtx } from '@/lib/restaurant/context';

/**
 * Mobil restoran API umumiy qismi: Bearer token (lib/mobileAuth) → RestaurantCtx (xabarlar o'zbekcha),
 * zod sxemalari, `?branchId=` so'rov parametrlari. Javoblar keshlanmaydi.
 */
export async function mobileCtx(req: Request): Promise<{ ctx: RestaurantCtx; s: RestaurantSchemas } | NextResponse> {
  const ctx = await restaurantCtxFromMobile(req);
  if (ctx instanceof NextResponse) return ctx;
  return { ctx, s: restaurantSchemas(ctx.d.restaurant.errors) };
}

export function queryOf(req: Request, a: { ctx: RestaurantCtx; s: RestaurantSchemas }) {
  return parseInput(a.s.query, searchParamsObject(new URL(req.url).searchParams), a.ctx.d.restaurant.errors.badInput);
}

export async function bodyOf<S extends z.ZodType>(req: Request, schema: S, a: { ctx: RestaurantCtx }) {
  const bad = a.ctx.d.restaurant.errors.badInput;
  return readJsonInput(req, schema, { badJson: bad, fallback: bad });
}

export function badRequest(error: string): NextResponse {
  return NextResponse.json({ error, code: 'badInput' }, { status: 400 });
}

export function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
