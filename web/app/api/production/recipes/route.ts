import { NextResponse } from 'next/server';
import { listRecipes } from '@/lib/production/recipes';
import { toResponse } from '@/lib/production/session';
import { apiCtx, noStore } from '../_shared';

/** Texkartalar: ?active=1|0|all (standart — faol) &q= &page= &limit= */
export async function GET(req: Request) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  const { q } = a;
  return noStore(toResponse(await listRecipes(a.ctx, { active: q.active, q: q.q || undefined, page: q.page ?? undefined, limit: q.limit ?? undefined })));
}
