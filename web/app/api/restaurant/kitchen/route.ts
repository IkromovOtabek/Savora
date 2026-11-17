import { NextResponse } from 'next/server';
import { kitchenBoard } from '@/lib/restaurant/queries';
import { toResponse } from '@/lib/restaurant/session';
import { apiCtx, noStore } from '../_shared';

/** Oshxona ekrani (KDS): ?stationId= &since=<oldingi javob next> — since'da bo'sh items = kartochkani olib tashlang */
export async function GET(req: Request) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  return noStore(toResponse(await kitchenBoard(a.ctx, a.q)));
}
