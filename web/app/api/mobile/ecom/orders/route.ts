import { NextResponse } from 'next/server';
import { apiJson } from '@/lib/ecom/api';
import { mobileEcomAdmin } from '@/lib/ecom/mobileShop';
import { shopOrders } from '@/lib/ecom/orders';

/** GET /api/mobile/ecom/orders?tab=active|done — onlayn buyurtmalar */
export async function GET(req: Request) {
  const ctx = await mobileEcomAdmin(req);
  if (ctx instanceof NextResponse) return ctx;
  const tab = new URL(req.url).searchParams.get('tab') === 'done' ? 'done' : 'active';
  return apiJson({ items: await shopOrders(ctx.org._id, tab) });
}
