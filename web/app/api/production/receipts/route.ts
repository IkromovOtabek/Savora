import { NextResponse } from 'next/server';
import { listReceipts } from '@/lib/production/receipts';
import { toResponse } from '@/lib/production/session';
import { apiCtx, listArgs, noStore } from '../_shared';

/** Kirim aktlari: ?status=draft|posted|cancelled &branchId= &supplierId= &purchaseOrderId= &from= &to= &q= &page= &limit= */
export async function GET(req: Request) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  return noStore(toResponse(await listReceipts(a.ctx, listArgs(a.q))));
}
