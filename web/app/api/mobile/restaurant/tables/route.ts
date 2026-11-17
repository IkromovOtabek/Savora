import { NextResponse } from 'next/server';
import { z } from 'zod';
import { tablesBoard } from '@/lib/restaurant/queries';
import { ackTableCall } from '@/lib/restaurant/ops';
import { toResponse } from '@/lib/restaurant/session';
import { badRequest, bodyOf, mobileCtx, noStore, queryOf } from '../_shared';

/** Stollar taxtasi (polling 3–5 s) — web GET /api/restaurant/tables bilan bir xil shakl */
export async function GET(req: Request) {
  const a = await mobileCtx(req);
  if (a instanceof NextResponse) return a;
  const q = queryOf(req, a);
  if (!q.ok) return badRequest(q.error);
  return noStore(toResponse(await tablesBoard(a.ctx, { branchId: q.data.branchId })));
}

/** { op: 'ackCall', tableId, kind?: 'waiter' | 'bill' } — mijoz chaqiruvi ko'rildi */
export async function POST(req: Request) {
  const a = await mobileCtx(req);
  if (a instanceof NextResponse) return a;
  const b = await bodyOf(req, z.object({ op: z.literal('ackCall') }).and(a.s.ackCall), a);
  if (!b.ok) return badRequest(b.error);
  return toResponse(await ackTableCall(a.ctx, b.data.tableId, b.data.kind));
}
