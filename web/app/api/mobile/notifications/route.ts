import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { loadUserPermissions } from '@/lib/permissionGuard';
import { getDictionary } from '@/lib/i18n/dict';
import { mobileLocale } from '@/lib/restaurant/session';
import { parseInput, readJsonInput } from '@/lib/validation';
import { listNotifications, markNotificationsRead, notifyListQuery, notifyReadBody } from '@/lib/notify';
import type { SessionUser } from '@/lib/session';

/**
 * Mobil bildirishnomalar (Bearer token) — web `/api/notifications` bilan bir xil shakl. Matn — ilova tilida
 * (`Accept-Language: uz|ru`). Muddati o'tgan do'konda: ro'yxat ochiladi, o'qildi belgisi — 402 (mobileAuth).
 *   GET  ?after=<ISO>&limit=0..50
 *   POST { id } | { all: true }
 */

function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

async function viewer(req: Request): Promise<(SessionUser & { dbName: string }) | NextResponse> {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.dbName || !auth.organizationId || (auth.role !== 'admin' && auth.role !== 'user')) {
    return NextResponse.json({ error: 'Avtorizatsiya kerak.', code: 'unauthorized' }, { status: 401 });
  }
  return auth as SessionUser & { dbName: string };
}

export async function GET(req: Request) {
  const user = await viewer(req);
  if (user instanceof NextResponse) return user;
  const d = getDictionary(mobileLocale(req));
  const q = parseInput(notifyListQuery, Object.fromEntries(new URL(req.url).searchParams), d.notify.errors.badInput);
  if (!q.ok) return NextResponse.json({ error: q.error, code: 'badInput' }, { status: 400 });
  const perms = await loadUserPermissions(user);
  return noStore(NextResponse.json(await listNotifications(user.dbName, user, perms, d, q.data)));
}

export async function POST(req: Request) {
  const user = await viewer(req);
  if (user instanceof NextResponse) return user;
  const d = getDictionary(mobileLocale(req));
  const b = await readJsonInput(req, notifyReadBody, { badJson: d.notify.errors.badInput, fallback: d.notify.errors.badInput });
  if (!b.ok) return NextResponse.json({ error: b.error, code: 'badInput' }, { status: 400 });
  const perms = await loadUserPermissions(user);
  const r = await markNotificationsRead(user.dbName, user, perms, b.data);
  if (!r.found) return NextResponse.json({ error: d.notify.errors.notFound, code: 'notFound' }, { status: 404 });
  return noStore(NextResponse.json({ unread: r.unread, updated: r.updated }));
}
