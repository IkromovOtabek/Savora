import { NextRequest, NextResponse } from 'next/server';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale } from '@/lib/i18n/config';

/** ?lang=ru|uz — til cookie'sini o'rnatadi (marketing havolalari uchun). Boshqa so'rovlarga tegmaydi. */
function applyLangParam(req: NextRequest, res: NextResponse): NextResponse {
  const lang = req.nextUrl.searchParams.get('lang');
  if (isLocale(lang)) {
    res.cookies.set(LOCALE_COOKIE, lang, { path: '/', maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  }
  return res;
}

/**
 * Subdomen yoki localhost path → zona aniqlash.
 * Edge runtime'da ishlaydi (DB so'rovi YO'Q).
 *
 * Production (path routing — bitta domen):
 *   savora.uz/             → root
 *   savora.uz/super/*      → super panel
 *   savora.uz/t/<slug>/*   → tenant
 * Yoki subdomen rejimi (USE_PATH_ROUTING=false):
 *   savora.uz / admin.savora.uz / <dokon>.savora.uz
 *
 * Localhost path (dev):
 *   localhost:3000/                    → root
 *   localhost:3000/super/login         → super login
 *   localhost:3000/super/*             → super panel
 *   localhost:3000/t/dokon1/login      → tenant login
 *   localhost:3000/app/* + cookie      → tenant (login qilingan)
 */
export function middleware(req: NextRequest) {
  const host = (req.headers.get('host') || '').split(':')[0];
  const root = process.env.ROOT_DOMAIN || 'lvh.me';
  const pathname = req.nextUrl.pathname;

  let zone: 'root' | 'super' | 'tenant' = 'root';
  let slug = '';

  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  const usePathRouting = process.env.NEXT_PUBLIC_USE_PATH_ROUTING !== 'false' && (isLocalHost || process.env.NEXT_PUBLIC_USE_PATH_ROUTING === 'true');

  // Path-routing (bitta domen: savora.uz/super/*, savora.uz/t/<slug>/*) — dev VA production'da.
  // Subdomen rejimi uchun NEXT_PUBLIC_USE_PATH_ROUTING=false qo'ying.
  if (usePathRouting) {
    if (pathname === '/super/login' || pathname.startsWith('/super/login')) {
      zone = 'super';
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set('x-app-zone', zone);
      requestHeaders.set('x-tenant-slug', '');
      return applyLangParam(req, NextResponse.rewrite(url, { request: { headers: requestHeaders } }));
    }

    if (pathname.startsWith('/super')) {
      zone = 'super';
    } else if (pathname.startsWith('/t/')) {
      const match = pathname.match(/^\/t\/([^/]+)(\/.*)?$/);
      if (match) {
        slug = match[1];
        zone = 'tenant';
        const rest = match[2] || '/login';
        const url = req.nextUrl.clone();
        url.pathname = rest.startsWith('/') ? rest : `/${rest}`;
        const requestHeaders = new Headers(req.headers);
        requestHeaders.set('x-app-zone', zone);
        requestHeaders.set('x-tenant-slug', slug);
        return applyLangParam(req, NextResponse.rewrite(url, { request: { headers: requestHeaders } }));
      }
    } else if (pathname.startsWith('/app') || pathname === '/login') {
      // Server Action POST /login — referer orqali zonani aniqlash (rewrite tufayli)
      if (pathname === '/login') {
        const ref = req.headers.get('referer') ?? '';
        if (ref.includes('/super/login') || /\/super(\/|$|\?)/.test(ref)) {
          zone = 'super';
        } else {
          const tenantRef = ref.match(/\/t\/([^/]+)/);
          if (tenantRef) {
            zone = 'tenant';
            slug = tenantRef[1];
          }
        }
      }
      const spZone = req.cookies.get('sp_zone')?.value;
      const spTenant = req.cookies.get('sp_tenant')?.value;
      if (spZone === 'tenant' && spTenant) {
        zone = 'tenant';
        slug = spTenant;
      } else if (pathname === '/login' && spZone === 'super') {
        zone = 'super';
      }
    }
  } else if (host === root || host === `www.${root}` || isLocalHost) {
    zone = 'root';
  } else if (host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -(root.length + 1));
    if (sub === 'admin') {
      zone = 'super';
    } else if (sub && sub !== 'www') {
      zone = 'tenant';
      slug = sub;
    }
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-app-zone', zone);
  requestHeaders.set('x-tenant-slug', slug);

  return applyLangParam(req, NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  // Faqat haqiqiy statik aktivlar istisno. `.*\..*` (har qanday nuqta) ishlatilmaydi —
  // aks holda `/login.x` kabi yo'lda middleware o'tkazib yuborilib, mijoz yuborgan
  // x-app-zone / x-tenant-slug sarlavhalari serverga yetib borardi.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|css|js|map|txt|xml|woff2?|ttf|json)$).*)'],
};
