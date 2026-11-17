import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { readJsonInput, parseInput } from '@/lib/validation';
import { productionCtxFromMobile } from '@/lib/production/session';
import { productionSchemas, searchParamsObject, type ProductionSchemas } from '@/lib/production/inputs';
import type { ProductionCtx } from '@/lib/production/context';

/**
 * Mobil ishlab chiqarish API umumiy qismi: Bearer token (lib/mobileAuth; muddati o'tgan do'konda yozish — 402)
 * → ProductionCtx (xabarlar o'zbekcha), zod sxemalari, `?…` so'rov parametrlari. Javoblar keshlanmaydi.
 */
export async function mobileCtx(req: Request): Promise<{ ctx: ProductionCtx; s: ProductionSchemas } | NextResponse> {
  const ctx = await productionCtxFromMobile(req);
  if (ctx instanceof NextResponse) return ctx;
  return { ctx, s: productionSchemas(ctx.d.production.errors) };
}

export function queryOf(req: Request, a: { ctx: ProductionCtx; s: ProductionSchemas }) {
  return parseInput(a.s.list, searchParamsObject(new URL(req.url).searchParams), a.ctx.d.production.errors.badInput);
}

export async function bodyOf<S extends z.ZodType>(req: Request, schema: S, a: { ctx: ProductionCtx }) {
  const bad = a.ctx.d.production.errors.badInput;
  return readJsonInput(req, schema, { badJson: bad, fallback: bad });
}

export function badRequest(error: string): NextResponse {
  return NextResponse.json({ error, code: 'badInput' }, { status: 400 });
}

export function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
