import { apiDict, apiJson, placeErrorText, placeSuccessText, readBody } from '@/lib/ecom/api';
import { getBuyerFromRequest } from '@/lib/ecom/buyerAuth';
import { buyerOrders, placeMarketOrders } from '@/lib/ecom/orders';
import { MARKET_DELIVERY, type MarketDelivery } from '@/lib/models/master/MarketOrder';

/** GET /api/market/orders — xaridorning buyurtmalari */
export async function GET(req: Request) {
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return apiJson({ error: apiDict(req).ecom.market.errors.loginRequired, code: 'unauthorized' }, 401);
  return apiJson({ items: await buyerOrders(buyer.id) });
}

/**
 * POST /api/market/orders { lines: [{listingId, qty, price?}], delivery, address?, note?, clientId? } → har do'konga buyurtma.
 * clientId bilan qayta yuborilsa — avval yaratilganlar qaytadi. 201: { orders, failedShops: slug[], message }.
 * 409: { error, code, details: { listingId, available, price } } (eski ilovalar uchun maydonlar yuqorida ham).
 */
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
    clientId: body.clientId,
  });
  if (!r.ok) {
    const fix = { listingId: r.listingId, available: r.available, price: r.price };
    return apiJson({ error: placeErrorText(t, r), code: r.error, ...fix, details: fix }, r.error === 'rateLimited' ? 429 : 409);
  }
  return apiJson({ orders: r.orders, failedShops: r.failedShops.map((s) => s.slug), message: placeSuccessText(t, r) }, 201);
}
