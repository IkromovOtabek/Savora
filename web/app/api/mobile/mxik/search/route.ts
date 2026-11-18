import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { DEFAULT_LOCALE, getDictionary, isLocale } from '@/lib/i18n';
import { mxikSearchResponse } from '@/lib/mxikCatalog';

/**
 * Mobil: MXIK katalogidan qidiruv — GET ?q= (web /api/mxik/search bilan bir xil javob).
 * Xato matnlari ilova tilida (`Accept-Language`: uz | ru).
 */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  { const denied = await mobilePermissionDenied(auth, 'product.create'); if (denied) return denied; }
  const first = (req.headers.get('accept-language') ?? '').split(',')[0]?.trim().slice(0, 2).toLowerCase();
  const locale = isLocale(first) ? first : DEFAULT_LOCALE;
  const t = getDictionary(locale).stock.mxik;
  const r = await mxikSearchResponse(
    `${auth.organizationId}:${auth.username}`,
    new URL(req.url).searchParams.get('q'),
    locale,
    { badQuery: t.badQuery, rateLimited: t.rateLimited, unavailable: t.unavailable },
  );
  return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
