import { NextResponse } from 'next/server';
import { apiDict, apiJson, readBody } from '@/lib/ecom/api';
import { mobileEcomAdmin } from '@/lib/ecom/mobileShop';
import { applyEcomEdit, findEcomGroup } from '@/lib/ecom/manage';
import { ecomDisplayName } from '@/lib/ecom/group';
import { syncOrgListingsById } from '@/lib/ecom/sync';
import { resolvePublicFileUrl } from '@/lib/fileUrl';

/** GET /api/mobile/ecom/item/:key — tovarning e-commerce ma'lumotlari */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await mobileEcomAdmin(req);
  if (ctx instanceof NextResponse) return ctx;
  const { key } = await params;
  const found = await findEcomGroup({ Product: ctx.m.Product, ShopSettings: ctx.m.ShopSettings }, key);
  if (!found) return apiJson({ error: apiDict(req).ecom.edit.errors.notFound, code: 'notFound' }, 404);
  const g = found.group;
  return apiJson({
    item: {
      key: g.key, name: g.name, displayName: ecomDisplayName(g), price: g.price, maxPrice: g.maxPrice, oldPrice: g.oldPrice,
      description: g.description ?? '', images: g.images, imageUrls: g.images.map(resolvePublicFileUrl),
      listed: g.explicit === true ? 'show' : g.explicit === false ? 'hide' : 'auto',
      state: g.state, qty: g.qty, unit: g.unit, copies: g.allIds.length,
    },
    autoPublish: found.autoPublish,
  });
}

/** PATCH /api/mobile/ecom/item/:key { name?, salePrice?, oldPrice?, description?, images?, listed? } */
export async function PATCH(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await mobileEcomAdmin(req);
  if (ctx instanceof NextResponse) return ctx;
  const { key } = await params;
  const t = apiDict(req).ecom.edit;
  const body = await readBody(req);
  if (!body) return apiJson({ error: t.errors.failed }, 400);
  const r = await applyEcomEdit({ Product: ctx.m.Product, ShopSettings: ctx.m.ShopSettings }, ctx.user, key, {
    name: body.name, salePrice: body.salePrice, oldPrice: body.oldPrice, description: body.description,
    images: body.images, listed: body.listed,
  });
  if (!r.ok) return apiJson({ error: t.errors[r.error], code: r.error }, r.error === 'notFound' ? 404 : 400);
  await syncOrgListingsById(ctx.org._id);
  return apiJson({ ok: true, key: r.key, message: t.saved });
}
