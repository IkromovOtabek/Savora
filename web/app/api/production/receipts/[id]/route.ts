import { NextResponse } from 'next/server';
import { getReceipt, receiptPrintData } from '@/lib/production/receipts';
import { toResponse } from '@/lib/production/session';
import { apiCtx, noStore } from '../../_shared';

/** Bitta kirim akti; `?print=1` — chop etiladigan nakladnoy ma'lumoti (ReceiptPrint) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  const { id } = await params;
  if (a.sp.get('print') === '1') return noStore(toResponse(await receiptPrintData(a.ctx, id)));
  return noStore(toResponse(await getReceipt(a.ctx, id)));
}
