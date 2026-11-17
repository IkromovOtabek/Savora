import { NextResponse } from 'next/server';
import { getRecipe } from '@/lib/production/recipes';
import { toResponse } from '@/lib/production/session';
import { apiCtx, noStore } from '../../_shared';

/** Bitta texkarta (eski versiyalar bilan); `production.viewCost` bo'lsa — `cost` (?branchId= ombordagi narxlar bilan) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  const { id } = await params;
  return noStore(toResponse(await getRecipe(a.ctx, id, { branchId: a.q.branchId })));
}
