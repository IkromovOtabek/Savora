import { apiDict, apiJson } from '@/lib/ecom/api';
import { getBuyerFromRequest } from '@/lib/ecom/buyerAuth';
import { cancelBuyerOrder } from '@/lib/ecom/orders';

/** POST /api/market/orders/:id/cancel — faqat «yangi» buyurtma */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = apiDict(req).ecom.market;
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return apiJson({ error: t.errors.loginRequired, code: 'unauthorized' }, 401);
  const { id } = await params;
  const ok = await cancelBuyerOrder(buyer.id, id);
  return ok ? apiJson({ ok: true, message: t.orders.cancelled }) : apiJson({ error: t.orders.cancelFailed, code: 'badState' }, 409);
}
