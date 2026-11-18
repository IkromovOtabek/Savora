import { apiDict, apiJson } from '@/lib/ecom/api';
import { getBuyerFromRequest } from '@/lib/ecom/buyerAuth';

/** GET /api/market/me — joriy xaridor (Bearer) */
export async function GET(req: Request) {
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return apiJson({ error: apiDict(req).ecom.market.errors.loginRequired, code: 'unauthorized' }, 401);
  return apiJson({ buyer });
}
