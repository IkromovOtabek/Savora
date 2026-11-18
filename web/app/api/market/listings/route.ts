import { apiJson, readLimited } from '@/lib/ecom/api';
import { parseSort, searchListings } from '@/lib/ecom/catalog';

/** GET /api/market/listings?q=&c=&shop=&sort=new|cheap|expensive&page= — ochiq katalog */
export async function GET(req: Request) {
  const limited = await readLimited(req);
  if (limited) return limited;
  const u = new URL(req.url).searchParams;
  const res = await searchListings({
    q: u.get('q') ?? undefined,
    category: u.get('c') || undefined,
    shop: u.get('shop') || undefined,
    sort: parseSort(u.get('sort')),
    page: Number(u.get('page')) || 1,
  });
  return apiJson(res);
}
