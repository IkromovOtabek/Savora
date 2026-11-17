import { NextResponse } from 'next/server';
import { getReceipt } from '@/lib/production/receipts';
import { toResponse } from '@/lib/production/session';
import { mobileCtx, noStore } from '../../_shared';

/** Bitta kirim akti (mobil, ko'rish) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await mobileCtx(req);
  if (a instanceof NextResponse) return a;
  const { id } = await params;
  return noStore(toResponse(await getReceipt(a.ctx, id)));
}
