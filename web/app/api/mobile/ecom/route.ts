import { NextResponse } from 'next/server';
import { apiJson } from '@/lib/ecom/api';
import { mobileEcomAdmin } from '@/lib/ecom/mobileShop';
import { shopEcomGroups } from '@/lib/ecom/manage';
import { countNewShopOrders } from '@/lib/ecom/orders';
import { ecomDisplayName } from '@/lib/ecom/group';
import { resolvePublicFileUrl } from '@/lib/fileUrl';

const FILTERS = ['all', 'live', 'hidden', 'noPrice'] as const;

/** GET /api/mobile/ecom?f=all|live|hidden|noPrice&q= — onlayn do'kon (vitrina) ro'yxati + sozlama */
export async function GET(req: Request) {
  const ctx = await mobileEcomAdmin(req);
  if (ctx instanceof NextResponse) return ctx;
  const u = new URL(req.url).searchParams;
  const f = (FILTERS as readonly string[]).includes(u.get('f') ?? '') ? u.get('f') : 'all';
  const q = (u.get('q') ?? '').trim().toLowerCase().slice(0, 60);
  const [{ groups, autoPublish, note }, newOrders] = await Promise.all([
    shopEcomGroups({ Product: ctx.m.Product, ShopSettings: ctx.m.ShopSettings }),
    countNewShopOrders(ctx.org._id),
  ]);
  const counts = { live: 0, hidden: 0, noPrice: 0 };
  for (const g of groups) counts[g.state]++;
  const items = groups
    .filter((g) => f === 'all' || g.state === f)
    .filter((g) => !q || ecomDisplayName(g).toLowerCase().includes(q))
    .slice(0, 300)
    .map((g) => ({
      key: g.key, name: ecomDisplayName(g), image: g.images[0] ? resolvePublicFileUrl(g.images[0]) : undefined,
      price: g.price, maxPrice: g.maxPrice, qty: g.qty, unit: g.unit, state: g.state, listed: g.listed,
      manual: typeof g.explicit === 'boolean',
    }));
  return apiJson({ autoPublish, note: note ?? '', slug: ctx.org.slug, counts, newOrders, items });
}
