import { apiDict, apiJson, readBody } from '@/lib/ecom/api';
import { getBuyerFromRequest } from '@/lib/ecom/buyerAuth';
import { buyerOrders, placeMarketOrders } from '@/lib/ecom/orders';
import { MARKET_DELIVERY, type MarketDelivery } from '@/lib/models/master/MarketOrder';
import { tr } from '@/lib/i18n/fmt';

/** GET /api/market/orders — xaridorning buyurtmalari */
export async function GET(req: Request) {
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return apiJson({ error: apiDict(req).ecom.market.errors.loginRequired, code: 'unauthorized' }, 401);
  return apiJson({ items: await buyerOrders(buyer.id) });
}

/** POST /api/market/orders { lines: [{listingId, qty, price?}], delivery, address?, note? } → har do'konga buyurtma */
export async function POST(req: Request) {
  const t = apiDict(req).ecom.market;
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return apiJson({ error: t.errors.loginRequired, code: 'unauthorized' }, 401);
  const body = await readBody(req);
  if (!body) return apiJson({ error: t.errors.failed, code: 'badRequest' }, 400);
  const delivery: MarketDelivery = (MARKET_DELIVERY as readonly string[]).includes(String(body.delivery)) ? (body.delivery as MarketDelivery) : 'pickup';
  const r = await placeMarketOrders(buyer, {
    lines: Array.isArray(body.lines) ? body.lines : [],
    delivery,
    address: typeof body.address === 'string' ? body.address : undefined,
    note: typeof body.note === 'string' ? body.note : undefined,
  });
  if (!r.ok) {
    const error = r.error === 'notEnough' ? tr(t.errors.notEnough, { qty: r.available ?? 0 }) : t.errors[r.error];
    return apiJson({ error, code: r.error, listingId: r.listingId, available: r.available, price: r.price }, r.error === 'rateLimited' ? 429 : 409);
  }
  return apiJson({ orders: r.orders, message: tr(t.checkout.success, { list: r.orders.map((o) => o.orderNo).join(', ') }) }, 201);
}
