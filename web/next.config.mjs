/** @type {import('next').NextConfig} */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

/*
 * ── Xavfsizlik sarlavhalari ──────────────────────────────────────────────
 * DIQQAT: headers() BUILD vaqtida hisoblanadi (routes-manifest'ga yoziladi).
 * ROOT_DOMAIN va CSP_MODE build paytida berilishi kerak (Dockerfile ARG / CI env).
 *
 * CSP qarorlari (har bir direktiva sababi docs/DEPLOY.md → "CSP" bo'limida):
 *  - script-src 'unsafe-inline': Next.js App Router RSC ma'lumotini inline <script>
 *    (self.__next_f.push) bilan yuboradi + layout'dagi tema skripti. Nonce uchun har
 *    sahifani dinamik render qilish kerak bo'lardi — hozircha 'unsafe-inline'.
 *    Asosiy XSS himoyasi: React avtomatik ekranlash + dangerouslySetInnerHTML faqat statik.
 *  - https://telegram.org — /tg Mini App skripti (telegram-web-app.js).
 *  - style-src 'unsafe-inline' — React style={} atributlari va next/font.
 *  - img-src https: — R2/CDN rasm manzili env'ga bog'liq; rasm XSS vektori emas.
 *  - frame-ancestors: hamma joyda 'none', faqat /tg va /app (Telegram Web ichida
 *    iframe'da ochiladi) — web.telegram.org.
 * CSP_MODE=report-only — muammo bo'lsa tezda yumshatish (brauzer bloklamaydi, faqat konsolda ogohlantiradi).
 * CSP_MODE=off — butunlay o'chirish (favqulodda holat).
 */
const CSP_MODE = process.env.CSP_MODE || 'enforce'; // enforce | report-only | off
const ROOT_DOMAIN = (process.env.ROOT_DOMAIN || '').trim();
// Brauzer Sentry'ga xato yuboradi — DSN host'i connect-src ga (faqat NEXT_PUBLIC_SENTRY_DSN bo'lsa)
const SENTRY_CONNECT = (() => {
  try {
    return process.env.NEXT_PUBLIC_SENTRY_DSN ? [new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).origin] : [];
  } catch {
    return [];
  }
})();
const TELEGRAM_FRAME_ANCESTORS = "'self' https://web.telegram.org https://*.telegram.org https://telegram.org";

function buildCsp(frameAncestors) {
  const formAction = ["'self'"];
  // Subdomen rejimida login root → <slug>.savora.uz ga redirect qiladi (form-action redirect'ni ham tekshiradi)
  if (ROOT_DOMAIN && !/lvh\.me|localhost/.test(ROOT_DOMAIN)) {
    formAction.push(`https://${ROOT_DOMAIN}`, `https://*.${ROOT_DOMAIN}`);
  }
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", 'https://telegram.org', ...(isProd ? [] : ["'unsafe-eval'"])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", 'https://telegram.org', ...SENTRY_CONNECT, ...(isProd ? [] : ['ws:', 'wss:'])],
    'media-src': ["'self'", 'blob:'],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'frame-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': formAction,
    'frame-ancestors': [frameAncestors],
    ...(isProd ? { 'upgrade-insecure-requests': [] } : {}),
  };
  return Object.entries(directives)
    .map(([k, v]) => (v.length ? `${k} ${v.join(' ')}` : k))
    .join('; ');
}

function securityHeaders({ framable }) {
  const h = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      // Kamera — shtrix-kod skaneri va rasmga olish (faqat o'z sahifalarimiz)
      value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
    { key: 'X-DNS-Prefetch-Control', value: 'on' },
  ];
  if (!framable) h.push({ key: 'X-Frame-Options', value: 'DENY' });
  if (isProd) {
    h.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' });
  }
  if (CSP_MODE !== 'off') {
    h.push({
      key: CSP_MODE === 'report-only' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
      value: buildCsp(framable ? TELEGRAM_FRAME_ANCESTORS : "'none'"),
    });
  }
  return h;
}

// Indekslanmasligi kerak bo'lgan zonalar (kabinet, super panel, tenant, API)
const NOINDEX = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // Docker uchun ixcham server (.next/standalone/server.js) — Dockerfile shuni ishlatadi
  output: 'standalone',
  serverExternalPackages: ['mongoose', 'bcryptjs'],
  outputFileTracingRoot: path.join(__dirname),
  transpilePackages: ['@zxing/browser', '@zxing/library'],

  async headers() {
    // Diqqat: bir nechta mos kelgan qoida bo'lsa, bir xil kalitli sarlavhaning oxirgisi yutadi.
    // Shuning uchun /tg va /app uchun ramkaga ruxsat beruvchi qoida umumiydan KEYIN keladi
    // va X-Frame-Options ni umumiy qoida ichida emas, alohida (framable bo'lmagan yo'llar) beramiz.
    return [
      {
        // Umumiy (ramkaga ruxsat berilmagan) — /tg va /app dan tashqari hammasi
        source: '/((?!tg(?:/|$)|app(?:/|$)).*)',
        headers: securityHeaders({ framable: false }),
      },
      {
        // Telegram Mini App: Telegram Web (web.telegram.org) uni iframe'da ochadi;
        // login'dan keyin /app ga o'tadi — u ham ramka ichida ishlashi kerak.
        source: '/tg',
        headers: securityHeaders({ framable: true }),
      },
      { source: '/tg/:path*', headers: securityHeaders({ framable: true }) },
      { source: '/app', headers: [...securityHeaders({ framable: true }), ...NOINDEX] },
      { source: '/app/:path*', headers: [...securityHeaders({ framable: true }), ...NOINDEX] },
      { source: '/super/:path*', headers: NOINDEX },
      { source: '/super', headers: NOINDEX },
      { source: '/t/:path*', headers: NOINDEX },
      { source: '/api/:path*', headers: NOINDEX },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
