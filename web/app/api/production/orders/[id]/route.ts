import { NextResponse } from 'next/server';
import { getOrder } from '@/lib/production/orders';
import { toResponse } from '@/lib/production/session';
import { apiCtx, noStore } from '../../_shared';

/** Bitta akt: xom ashyo (reja/haqiqiy/farq), ish haqi, tannarx (huquq bo'lsa), `can` (UI tugmalari) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  const { id } = await params;
  return noStore(toResponse(await getOrder(a.ctx, id)));
}
