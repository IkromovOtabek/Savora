import { NextResponse } from 'next/server';
import { clientIpFrom } from '@/lib/security';
import { getDict } from '@/lib/i18n/server';
import { fail } from '@/lib/restaurant/context';
import { errorResponse } from '@/lib/restaurant/session';
import { loadPublicStorePage } from '@/lib/restaurant/public';
import { headersFor, storeCacheHeaders, storeRateLimited } from '../_shared';

type Params = { params: Promise<{ slug: string }> };

/**
 * Umumiy mijoz sahifasi ma'lumoti (stolsiz, faqat o'qish): brend, aloqa, xizmat haqi, menyu (stop-list va tugaganlar
 * yashirin). Faqat `qrMenu` + `tables` yoqiq faol do'kon; aks holda 404 `qrUnavailable`. Rate-limit IP bo'yicha.
 * Buyurtma bu yerda yo'q — u stol QR'i (/api/public/menu/<slug>/<token>/order) orqali.
 */
export async function GET(req: Request, { params }: Params) {
  const d = await getDict();
  const limited = await storeRateLimited(clientIpFrom(req.headers), d);
  if (limited) return limited;
  const { slug } = await params;
  const page = await loadPublicStorePage(String(slug));
  if (!page) return headersFor(errorResponse(fail(d, 'qrUnavailable')));
  return storeCacheHeaders(NextResponse.json(page));
}
