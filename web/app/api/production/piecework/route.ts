import { NextResponse } from 'next/server';
import { listPiecework } from '@/lib/production/piecework';
import { toResponse } from '@/lib/production/session';
import { apiCtx, listArgs, noStore } from '../_shared';

/**
 * Ishbay yozuvlari: ?status=logged|approved|rejected|paid &workerId= &productionOrderId= &from= &to= &mine=1 &page=
 * Ishchi (`piecework.log`) — faqat o'ziniki; `sums` — filtrga mos jami (yozildi/tasdiqlandi/to'landi, to'lanadigan)
 */
export async function GET(req: Request) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  return noStore(toResponse(await listPiecework(a.ctx, listArgs(a.q))));
}
