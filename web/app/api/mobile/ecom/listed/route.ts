import { NextResponse } from 'next/server';
import { apiDict, apiJson, readBody } from '@/lib/ecom/api';
import { mobileEcomAdmin } from '@/lib/ecom/mobileShop';
import { setEcomListed } from '@/lib/ecom/manage';
import { syncOrgListingsById } from '@/lib/ecom/sync';

/** POST /api/mobile/ecom/listed { keys: string[], mode: 'show'|'hide'|'auto' } */
export async function POST(req: Request) {
  const ctx = await mobileEcomAdmin(req);
  if (ctx instanceof NextResponse) return ctx;
  const body = await readBody(req);
  const mode = body?.mode;
  if (!body || !Array.isArray(body.keys) || (mode !== 'show' && mode !== 'hide' && mode !== 'auto')) {
    return apiJson({ error: apiDict(req).ecom.panel.failed }, 400);
  }
  const n = await setEcomListed({ Product: ctx.m.Product, ShopSettings: ctx.m.ShopSettings }, ctx.user, body.keys.map(String), mode === 'auto' ? null : mode === 'show');
  await syncOrgListingsById(ctx.org._id);
  return apiJson({ ok: true, updated: n });
}
