import { NextResponse } from 'next/server';
import { apiDict, apiJson, readBody } from '@/lib/ecom/api';
import { mobileEcomAdmin } from '@/lib/ecom/mobileShop';
import { saveShopSettingsPart } from '@/lib/shopSettings';
import { recordAudit } from '@/lib/audit';
import { syncOrgListingsById } from '@/lib/ecom/sync';

/** PATCH /api/mobile/ecom/settings { autoPublish: boolean, note?: string } */
export async function PATCH(req: Request) {
  const ctx = await mobileEcomAdmin(req);
  if (ctx instanceof NextResponse) return ctx;
  const t = apiDict(req).ecom.settings;
  const body = await readBody(req);
  if (!body || typeof body.autoPublish !== 'boolean') return apiJson({ error: t.failed }, 400);
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : undefined;
  await saveShopSettingsPart(ctx.m.ShopSettings, 'ecom', { autoPublish: body.autoPublish, ...(note !== undefined ? { note: note || undefined } : {}) }, ctx.user.username);
  await recordAudit(ctx.user, {
    action: 'settings.ecom', entity: 'branch',
    summary: `E-commerce: avtomatik chiqarish ${body.autoPublish ? 'yoqildi' : "o'chirildi"} (mobil)`,
  });
  await syncOrgListingsById(ctx.org._id);
  return apiJson({ ok: true, message: t.saved });
}
