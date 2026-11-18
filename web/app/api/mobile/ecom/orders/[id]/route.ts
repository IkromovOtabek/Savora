import { NextResponse } from 'next/server';
import { apiDict, apiJson, readBody } from '@/lib/ecom/api';
import { mobileEcomAdmin } from '@/lib/ecom/mobileShop';
import { completeShopOrder, setShopOrderStatus } from '@/lib/ecom/orders';
import { tr } from '@/lib/i18n/fmt';

/** POST /api/mobile/ecom/orders/:id { action: 'accept'|'reject'|'complete', reason? } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await mobileEcomAdmin(req);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const k = apiDict(req).ecom.orders;
  const body = await readBody(req);
  const action = body?.action;
  if (action !== 'accept' && action !== 'reject' && action !== 'complete') return apiJson({ error: k.errors.failed }, 400);
  const actor = { id: ctx.user.id, username: ctx.user.username, role: 'admin' as const, dbName: ctx.user.dbName };
  const r = action === 'complete'
    ? await completeShopOrder(ctx.org._id, actor, id)
    : await setShopOrderStatus(ctx.org._id, actor, id, action, typeof body?.reason === 'string' ? body.reason : undefined);
  if (!r.ok) {
    const error = r.error === 'notEnough' ? tr(k.errors.notEnough, { item: r.item ?? '' }) : k.errors[r.error];
    return apiJson({ error, code: r.error }, r.error === 'notFound' ? 404 : 409);
  }
  return apiJson({ ok: true, message: k.done[action], saleNos: r.saleNos });
}
