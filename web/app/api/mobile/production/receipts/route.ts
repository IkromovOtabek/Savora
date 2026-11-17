import { NextResponse } from 'next/server';
import { listReceipts } from '@/lib/production/receipts';
import { toResponse } from '@/lib/production/session';
import { badRequest, mobileCtx, noStore, queryOf } from '../_shared';

/** Kirim aktlari (mobil, omborchi — ko'rish): ?status= &supplierId= &from= &to= &q= &page= (narx — huquq bo'lsa) */
export async function GET(req: Request) {
  const a = await mobileCtx(req);
  if (a instanceof NextResponse) return a;
  const q = queryOf(req, a);
  if (!q.ok) return badRequest(q.error);
  return noStore(toResponse(await listReceipts(a.ctx, {
    status: q.data.status || undefined, supplierId: q.data.supplierId, purchaseOrderId: q.data.purchaseOrderId,
    from: q.data.from, to: q.data.to, q: q.data.q || undefined, page: q.data.page ?? undefined, limit: q.data.limit ?? undefined,
  })));
}
