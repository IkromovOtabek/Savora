import { NextResponse } from 'next/server';
import { pieceworkSummary } from '@/lib/production/piecework';
import { toResponse } from '@/lib/production/session';
import { apiCtx, noStore } from '../../_shared';

/** Xodim bo'yicha davr jamlamasi: ?from= &to= (standart — joriy oy, ≤366 kun) &workerId= */
export async function GET(req: Request) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  return noStore(toResponse(await pieceworkSummary(a.ctx, { from: a.q.from, to: a.q.to, workerId: a.q.workerId })));
}
