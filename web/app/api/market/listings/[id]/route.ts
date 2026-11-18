import { apiDict, apiJson, readLimited } from '@/lib/ecom/api';
import { getListing } from '@/lib/ecom/catalog';

/** GET /api/market/listings/:id — mahsulot sahifasi */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await readLimited(req);
  if (limited) return limited;
  const { id } = await params;
  const item = await getListing(id);
  if (!item) return apiJson({ error: apiDict(req).ecom.market.notFound, code: 'notFound' }, 404);
  return apiJson({ item });
}
