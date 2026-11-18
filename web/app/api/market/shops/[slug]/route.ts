import { apiDict, apiJson, readLimited } from '@/lib/ecom/api';
import { shopInfo } from '@/lib/ecom/catalog';

/** GET /api/market/shops/:slug — do'kon nomi, xarid shartlari, tovarlar soni */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const limited = await readLimited(req);
  if (limited) return limited;
  const { slug } = await params;
  const shop = await shopInfo(slug);
  if (!shop) return apiJson({ error: apiDict(req).ecom.market.notFound, code: 'notFound' }, 404);
  return apiJson({ shop });
}
