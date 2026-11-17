import { NextResponse } from 'next/server';
import { listPiecework, logPiecework, pieceworkSummary } from '@/lib/production/piecework';
import { toResponse } from '@/lib/production/session';
import { badRequest, bodyOf, mobileCtx, noStore, queryOf } from '../_shared';

/**
 * Ishbay (mobil).
 * GET  ?status= &from= &to= &page= — o'z yozuvlari (`piecework.approve` bo'lsa — hammaniki; ?mine=1 — faqat o'zi).
 *      ?summary=1 — davr jamlamasi (standart joriy oy): { from, to, workers, totals }.
 * POST { productionOrderId?, operation, qty, rate?, workDate?, note?, clientId } — yozish. `clientId` (UUID, 8–64)
 *      tavsiya: oflayn/takroriy yuborishda ikkinchi yozuv paydo bo'lmaydi (`existing: true`). Javob 201.
 */
export async function GET(req: Request) {
  const a = await mobileCtx(req);
  if (a instanceof NextResponse) return a;
  const q = queryOf(req, a);
  if (!q.ok) return badRequest(q.error);
  if (new URL(req.url).searchParams.get('summary') === '1') {
    return noStore(toResponse(await pieceworkSummary(a.ctx, { from: q.data.from, to: q.data.to, workerId: q.data.mine ? a.ctx.user.id : q.data.workerId })));
  }
  return noStore(toResponse(await listPiecework(a.ctx, {
    status: q.data.status || undefined, workerId: q.data.workerId, productionOrderId: q.data.productionOrderId,
    from: q.data.from, to: q.data.to, page: q.data.page ?? undefined, limit: q.data.limit ?? undefined, mine: q.data.mine,
  })));
}

export async function POST(req: Request) {
  const a = await mobileCtx(req);
  if (a instanceof NextResponse) return a;
  const b = await bodyOf(req, a.s.pieceworkLog, a);
  if (!b.ok) return badRequest(b.error);
  const r = await logPiecework(a.ctx, b.data);
  return toResponse(r, r.ok && !r.data.existing ? 201 : 200);
}
