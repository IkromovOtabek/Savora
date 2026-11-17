import { NextResponse } from 'next/server';
import { tablesBoard } from '@/lib/restaurant/queries';
import { toResponse } from '@/lib/restaurant/session';
import { apiCtx, noStore } from '../_shared';

/** Stollar taxtasi (polling 3–5 s): zallar, stollar, ochiq buyurtma qisqa ma'lumoti, mijoz chaqiruvlari, saboylar */
export async function GET(req: Request) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  return noStore(toResponse(await tablesBoard(a.ctx, { branchId: a.q.branchId })));
}
