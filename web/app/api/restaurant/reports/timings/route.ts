import { NextResponse } from 'next/server';
import { timingsReport } from '@/lib/restaurant/queries';
import { toResponse } from '@/lib/restaurant/session';
import { apiCtx, noStore } from '../../_shared';

/** Tayyorlanish/yetkazish vaqtlari: ?from=<ISO>&to=<ISO> (ko'pi bilan 93 kun; standart — oxirgi 7 kun) */
export async function GET(req: Request) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  const sp = new URL(req.url).searchParams;
  const to = sp.get('to') ? new Date(String(sp.get('to'))) : new Date();
  const from = sp.get('from') ? new Date(String(sp.get('from'))) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: a.ctx.d.restaurant.errors.badInput, code: 'badInput' }, { status: 400 });
  }
  return noStore(toResponse(await timingsReport(a.ctx, { from, to, branchId: a.q.branchId })));
}
