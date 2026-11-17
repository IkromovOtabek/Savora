import { NextResponse } from 'next/server';
import { getOrder } from '@/lib/restaurant/queries';
import { toResponse } from '@/lib/restaurant/session';
import { apiCtx, noStore } from '../../_shared';

/** Bitta buyurtma: taomlar, to'lovlar, hisob, `can` (UI tugmalari) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  const { id } = await params;
  return noStore(toResponse(await getOrder(a.ctx, id)));
}
