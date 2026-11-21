import { apiDict, apiJson } from '@/lib/ecom/api';
import { clientIpFrom } from '@/lib/security';
import { hitRateLimit } from '@/lib/rateLimit';
import { startTgSignup, tgSignupEnabled, tgSignupStatus } from '@/lib/tgSignup';

/**
 * Telegram orqali ro'yxatdan o'tish (mobil: xaridor ham, biznes ham) — lib/tgSignup.ts.
 *   POST → { nonce, url, expiresAt } — ilova `url` ni (t.me/<bot>?start=su_…) ochadi
 *   GET ?nonce= → { status: 'pending' } | { status: 'done', ticket, name, phone } | { status: 'expired' }
 *   GET (nonce'siz) → { enabled } — bot sozlanmagan bo'lsa ilova Telegram tugmasini yashiradi
 */
export async function POST(req: Request) {
  const t = apiDict(req).ecom.market.auth.errors;
  const r = await startTgSignup(clientIpFrom(req.headers));
  if (!r.ok) {
    return r.error === 'rateLimited'
      ? apiJson({ error: t.rateLimited, code: r.error }, 429)
      : apiJson({ error: t.tgNotConfigured, code: r.error }, 503);
  }
  return apiJson({ nonce: r.nonce, url: r.url, expiresAt: r.expiresAt.toISOString() }, 201);
}

export async function GET(req: Request) {
  const t = apiDict(req).ecom.market.auth.errors;
  // Ilova har 2 soniyada so'raydi (eng ko'pi 15 daqiqa ≈ 450 so'rov). Asosiy chegara — so'rov (nonce) bo'yicha;
  // IP chegarasi keng: mobil operator NAT'i ortida ko'p foydalanuvchi bitta IP'da bo'ladi. Nonce 192 bit — taxmin qilinmaydi.
  const nonce = new URL(req.url).searchParams.get('nonce') ?? '';
  if (!nonce) return apiJson({ enabled: tgSignupEnabled() });
  const ip = clientIpFrom(req.headers);
  const [rlNonce, rlIp] = await Promise.all([
    hitRateLimit(`tg-signup-status:n:${nonce.slice(0, 40)}`, 600, 15 * 60_000),
    hitRateLimit(`tg-signup-status:ip:${ip}`, 10_000, 15 * 60_000),
  ]);
  if (!rlNonce.ok || !rlIp.ok) return apiJson({ error: t.rateLimited, code: 'rateLimited' }, 429);
  return apiJson(await tgSignupStatus(nonce));
}
