import { NextResponse } from 'next/server';
import { hitRateLimit } from '@/lib/rateLimit';
import { clientIpFrom } from '@/lib/security';
import { getDict } from '@/lib/i18n/server';
import type { Dict } from '@/lib/i18n/dict';
import { resolvePublicTable, type PublicTableCtx } from '@/lib/restaurant/public';
import { errorResponse } from '@/lib/restaurant/session';

/**
 * Mijoz QR-menyusi ochiq API'si: login yo'q, rate-limit MAJBURIY (IP va stol bo'yicha), faqat
 * `qrMenu` yoqilgan faol do'kon. Javoblar keshlanmaydi va qidiruvga chiqmaydi.
 */
export type Limit = { key: string; max: number; windowMs: number };

export const LIMITS = {
  /** Menyu va buyurtma holatini o'qish — IP bo'yicha */
  read: (ip: string): Limit => ({ key: `qr:read:${ip}`, max: 120, windowMs: 60_000 }),
  /** Buyurtma berish — IP va stol bo'yicha */
  orderIp: (ip: string): Limit => ({ key: `qr:order:${ip}`, max: 10, windowMs: 10 * 60_000 }),
  orderTable: (token: string): Limit => ({ key: `qr:order-t:${token}`, max: 20, windowMs: 10 * 60_000 }),
  /** Ofitsant/hisob chaqiruvi */
  callIp: (ip: string): Limit => ({ key: `qr:call:${ip}`, max: 20, windowMs: 5 * 60_000 }),
  callTable: (token: string): Limit => ({ key: `qr:call-t:${token}`, max: 6, windowMs: 5 * 60_000 }),
};

export function headersFor(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}

export async function publicTable(
  req: Request,
  params: Promise<{ slug: string; token: string }>,
  limits: (ip: string, token: string) => Limit[],
): Promise<{ c: PublicTableCtx; d: Dict } | NextResponse> {
  const d = await getDict();
  const ip = clientIpFrom(req.headers);
  const { slug, token } = await params;
  for (const l of limits(ip, String(token).slice(0, 64))) {
    const rl = await hitRateLimit(l.key, l.max, l.windowMs);
    if (!rl.ok) {
      const res = NextResponse.json({ error: d.restaurant.errors.rateLimited, code: 'rateLimited' }, { status: 429 });
      res.headers.set('Retry-After', String(rl.retryAfterSec ?? 60));
      return headersFor(res);
    }
  }
  const r = await resolvePublicTable(String(slug), String(token), d);
  if (!r.ok) return headersFor(errorResponse(r));
  return { c: r.data, d };
}
