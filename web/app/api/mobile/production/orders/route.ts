import { NextResponse } from 'next/server';
import { listOrders } from '@/lib/production/orders';
import { toResponse } from '@/lib/production/session';
import { badRequest, mobileCtx, noStore, queryOf } from '../_shared';

/**
 * Aktlar ro'yxati (mobil, ishchi ishbay yozishda tanlaydi): ?status=active (standart) |done|… &q= &page=
 * Har aktda `operations: [{ name, rate }]` — texkarta operatsiyalari (narx serverda olinadi).
 */
export async function GET(req: Request) {
  const a = await mobileCtx(req);
  if (a instanceof NextResponse) return a;
  const q = queryOf(req, a);
  if (!q.ok) return badRequest(q.error);
  return noStore(toResponse(await listOrders(a.ctx, {
    status: q.data.status || 'active', q: q.data.q || undefined, page: q.data.page ?? undefined, limit: q.data.limit ?? undefined,
  })));
}
