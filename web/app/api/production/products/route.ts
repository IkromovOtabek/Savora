import { NextResponse } from 'next/server';
import { productOptions } from '@/lib/production/catalog';
import { toResponse } from '@/lib/production/session';
import { apiCtx, noStore } from '../_shared';

/**
 * Mahsulot tanlash (texkarta/akt/kirim/xarid qatorlari): ?branchId= &q= &limit= (≤50).
 * `?ids=a,b,c` (≤50) — aynan shu tovarlar (doiradagi istalgan filial) — «Kam qolgan» blokidan formani to'ldirish.
 */
export async function GET(req: Request) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  return noStore(toResponse(await productOptions(a.ctx, { branchId: a.q.branchId, q: a.q.q || undefined, limit: a.q.limit ?? undefined, ids: a.q.ids })));
}
