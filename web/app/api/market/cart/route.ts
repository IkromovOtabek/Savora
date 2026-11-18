import { apiJson, readBody, readLimited } from '@/lib/ecom/api';
import { cartListings } from '@/lib/ecom/catalog';

/** POST /api/market/cart { ids: string[] } — savatdagi tovarlarning joriy narxi/qoldig'i (sotuvdan olinganlar yo'q) */
export async function POST(req: Request) {
  const limited = await readLimited(req);
  if (limited) return limited;
  const body = await readBody(req);
  return apiJson({ items: await cartListings(body?.ids) });
}
