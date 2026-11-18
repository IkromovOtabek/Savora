import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { parseInput } from '@/lib/validation';
import { productionCtxFromApi } from '@/lib/production/session';
import { productionSchemas, searchParamsObject, type ProductionSchemas } from '@/lib/production/inputs';
import type { ProductionCtx } from '@/lib/production/context';

export type ListQuery = z.output<ProductionSchemas['list']>;

/**
 * Web JSON API umumiy qismi (faqat GET, sessiya cookie): ctx + `?status=&branchId=&from=&to=&q=&page=&limit=…`.
 * Javoblar keshlanmaydi (`no-store`). Xato: `{ error, code, details? }` + HTTP holati (docs/SEX_API.md §11).
 */
export async function apiCtx(req: Request): Promise<{ ctx: ProductionCtx; s: ProductionSchemas; q: ListQuery; sp: URLSearchParams } | NextResponse> {
  const ctx = await productionCtxFromApi();
  if (ctx instanceof NextResponse) return ctx;
  const s = productionSchemas(ctx.d.production.errors);
  const sp = new URL(req.url).searchParams;
  const p = parseInput(s.list, searchParamsObject(sp), ctx.d.production.errors.badInput);
  if (!p.ok) return NextResponse.json({ error: p.error, code: 'badInput' }, { status: 400 });
  return { ctx, s, q: p.data, sp };
}

/** ListQuery → lib funksiyalari kutadigan shakl (null/'' → undefined) */
export function listArgs(q: ListQuery) {
  return {
    status: q.status || undefined,
    branchId: q.branchId,
    supplierId: q.supplierId,
    recipeId: q.recipeId,
    workerId: q.workerId,
    productionOrderId: q.productionOrderId,
    purchaseOrderId: q.purchaseOrderId,
    from: q.from,
    to: q.to,
    q: q.q || undefined,
    page: q.page ?? undefined,
    limit: q.limit ?? undefined,
    mine: q.mine,
    sort: q.sort,
    due: q.due,
  };
}

export function badRequest(error: string): NextResponse {
  return NextResponse.json({ error, code: 'badInput' }, { status: 400 });
}

export function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
