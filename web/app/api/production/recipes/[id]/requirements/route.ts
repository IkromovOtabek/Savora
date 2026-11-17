import { NextResponse } from 'next/server';
import { parseInput } from '@/lib/validation';
import { getRequirements } from '@/lib/production/recipes';
import { toResponse } from '@/lib/production/session';
import { apiCtx, badRequest, noStore } from '../../../_shared';

/** Ehtiyoj hisobi: ?qty=<tayyor mahsulot miqdori> &branchId=<xom ashyo ombori> */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  const { id } = await params;
  const p = parseInput(a.s.requirements, { recipeId: id, qty: a.sp.get('qty') ?? '', branchId: a.sp.get('branchId') ?? undefined }, a.ctx.d.production.errors.badInput);
  if (!p.ok) return badRequest(p.error);
  return noStore(toResponse(await getRequirements(a.ctx, p.data)));
}
