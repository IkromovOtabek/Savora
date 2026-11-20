import { NextResponse } from 'next/server';
import { getApiTenantContext } from '@/lib/auth';
import { loadUserPermissions } from '@/lib/permissionGuard';
import { getDict } from '@/lib/i18n/server';
import { parseInput, readJsonInput } from '@/lib/validation';
import { listNotifications, markNotificationsRead, notifyListQuery, notifyReadBody } from '@/lib/notify';

/**
 * Web qo'ng'iroqcha (sessiya cookie): ro'yxat + o'qilmaganlar soni, o'qildi belgisi. Kim ko'rishi — lib/notify.ts
 * (joriy huquq va filial bilan serverda filtrlanadi). Javoblar keshlanmaydi.
 *   GET  ?after=<ISO>&limit=0..50 — `after` bilan faqat yangilari (polling), `limit=0` — faqat son
 *   POST { id } | { all: true }   — o'qildi; javob `{ unread }`
 */

function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function GET(req: Request) {
  const [ctx, d] = await Promise.all([getApiTenantContext(), getDict()]);
  if (!ctx?.user.dbName) return NextResponse.json({ error: d.stock.export.authRequired, code: 'unauthorized' }, { status: 401 });
  const q = parseInput(notifyListQuery, Object.fromEntries(new URL(req.url).searchParams), d.notify.errors.badInput);
  if (!q.ok) return NextResponse.json({ error: q.error, code: 'badInput' }, { status: 400 });
  const perms = await loadUserPermissions(ctx.user);
  return noStore(NextResponse.json(await listNotifications(ctx.user.dbName, ctx.user, perms, d, q.data)));
}

export async function POST(req: Request) {
  const [ctx, d] = await Promise.all([getApiTenantContext(), getDict()]);
  if (!ctx?.user.dbName) return NextResponse.json({ error: d.stock.export.authRequired, code: 'unauthorized' }, { status: 401 });
  const b = await readJsonInput(req, notifyReadBody, { badJson: d.notify.errors.badInput, fallback: d.notify.errors.badInput });
  if (!b.ok) return NextResponse.json({ error: b.error, code: 'badInput' }, { status: 400 });
  const perms = await loadUserPermissions(ctx.user);
  const r = await markNotificationsRead(ctx.user.dbName, ctx.user, perms, b.data);
  if (!r.found) return NextResponse.json({ error: d.notify.errors.notFound, code: 'notFound' }, { status: 404 });
  return noStore(NextResponse.json({ unread: r.unread, updated: r.updated }));
}
