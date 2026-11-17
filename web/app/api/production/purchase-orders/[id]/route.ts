import { NextResponse } from 'next/server';
import { getPo } from '@/lib/production/purchaseOrders';
import { toResponse } from '@/lib/production/session';
import { apiCtx, noStore } from '../../_shared';

/** Bitta xarid buyurtmasi (qatorlar: buyurtma, qabul qilingan, qolgan) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  const { id } = await params;
  return noStore(toResponse(await getPo(a.ctx, id)));
}
