import { NextResponse } from 'next/server';
import { productionMeta } from '@/lib/production/catalog';
import { toResponse } from '@/lib/production/session';
import { apiCtx, noStore } from '../_shared';

/** UI uchun: modullar, filiallar (admin — hammasi), standart ombor, birliklar, huquq bayroqlari (`can`) */
export async function GET(req: Request) {
  const a = await apiCtx(req);
  if (a instanceof NextResponse) return a;
  return noStore(toResponse(await productionMeta(a.ctx)));
}
