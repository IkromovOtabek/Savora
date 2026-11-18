import { NextResponse } from 'next/server';
import { getApiTenantContext } from '@/lib/auth';
import { loadUserPermissions } from '@/lib/permissionGuard';
import { getI18n } from '@/lib/i18n/server';
import { mxikSearchResponse } from '@/lib/mxikCatalog';

/**
 * MXIK katalogidan qidiruv (mahsulot formasi): GET ?q=<nom, kod yoki shtrix-kod>
 * → { items: MxikItem[], source } | { error, siteUrl? }. Huquq: mahsulot qo'shish yoki tahrirlash.
 */
export async function GET(req: Request) {
  const { locale, d } = await getI18n();
  const t = d.stock.mxik;
  const ctx = await getApiTenantContext();
  if (!ctx) return NextResponse.json({ error: d.stock.export.authRequired }, { status: 401 });
  const perms = await loadUserPermissions(ctx.user);
  if (!perms.has('product.create') && !perms.has('product.edit')) {
    return NextResponse.json({ error: d.stock.export.noPermission }, { status: 403 });
  }
  const r = await mxikSearchResponse(
    `${ctx.org._id}:${ctx.user.username}`,
    new URL(req.url).searchParams.get('q'),
    locale,
    { badQuery: t.badQuery, rateLimited: t.rateLimited, unavailable: t.unavailable },
  );
  return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
