import { apiDict, apiJson, readBody } from '@/lib/ecom/api';
import { deleteBuyerAccount, getBuyerFromRequest } from '@/lib/ecom/buyerAuth';

/** POST /api/market/account/delete { password } — xaridor hisobini o'chirish (App Store 5.1.1(v)) */
export async function POST(req: Request) {
  const t = apiDict(req).ecom.market;
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return apiJson({ error: t.errors.loginRequired, code: 'unauthorized' }, 401);
  const body = await readBody(req);
  const r = await deleteBuyerAccount(buyer.id, body?.password);
  if (r.ok) return apiJson({ ok: true, message: t.account.deleted });
  const status = r.error === 'rateLimited' ? 429 : r.error === 'activeOrders' ? 409 : r.error === 'notFound' ? 404 : 400;
  return apiJson({ error: t.account.errors[r.error], code: r.error }, status);
}
