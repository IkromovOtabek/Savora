import { apiJson, readLimited } from '@/lib/ecom/api';
import { topCategories } from '@/lib/ecom/catalog';

/** GET /api/market/categories?shop= — turkum filtrlari */
export async function GET(req: Request) {
  const limited = await readLimited(req);
  if (limited) return limited;
  const shop = new URL(req.url).searchParams.get('shop') || undefined;
  return apiJson({ items: await topCategories(shop) });
}
