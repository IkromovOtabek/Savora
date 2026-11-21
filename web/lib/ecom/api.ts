import { NextResponse } from 'next/server';
import { getDictionary, type Dict } from '../i18n/dict';
import { isLocale } from '../i18n/config';
import { hitRateLimit } from '../rateLimit';
import { clientIpFrom } from '../security';
import { tr } from '../i18n/fmt';
import type { PlaceOrderResult } from './orders';

/**
 * Savora Market REST API yordamchilari (mobil ilova; web sahifalar server action ishlatadi).
 * Til — `Accept-Language` (uz | ru). Ochiq o'qish IP bo'yicha rate-limit; javoblar keshlanmaydi.
 */
export function apiDict(req: Request): Dict {
  const first = (req.headers.get('accept-language') ?? '').split(',')[0]?.trim().slice(0, 2).toLowerCase();
  return getDictionary(isLocale(first) ? first : 'uz');
}

export function apiJson(body: unknown, status = 200): NextResponse {
  const res = NextResponse.json(body, { status });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

/** Ochiq o'qish: 1 daqiqada 300 so'rov / IP */
export async function readLimited(req: Request): Promise<NextResponse | null> {
  const ip = clientIpFrom(req.headers);
  const rl = await hitRateLimit(`mk:read:${ip}`, 300, 60_000);
  if (rl.ok) return null;
  const res = apiJson({ error: apiDict(req).ecom.market.auth.errors.rateLimited, code: 'rateLimited' }, 429);
  res.headers.set('Retry-After', String(rl.retryAfterSec ?? 60));
  return res;
}

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type PlaceFail = Extract<PlaceOrderResult, { ok: false }>;

/** Buyurtma rad javobi matni (REST va web server action uchun umumiy): tovar nomi ma'lum bo'lsa — u bilan */
export function placeErrorText(t: Dict['ecom']['market'], r: PlaceFail): string {
  const name = r.name;
  if (r.error === 'notEnough') {
    return name ? tr(t.errors.notEnoughItem, { name, qty: r.available ?? 0 }) : tr(t.errors.notEnough, { qty: r.available ?? 0 });
  }
  if (name && r.error === 'unavailable') return tr(t.errors.unavailableItem, { name });
  if (name && r.error === 'priceChanged') return tr(t.errors.priceChangedItem, { name });
  return t.errors[r.error];
}

/** Muvaffaqiyat matni: ba'zi do'konlarga yuborilmagan bo'lsa — aytiladi */
export function placeSuccessText(t: Dict['ecom']['market'], r: Extract<PlaceOrderResult, { ok: true }>): string {
  const list = r.orders.map((o) => o.orderNo).join(', ');
  return r.failedShops.length
    ? tr(t.checkout.partial, { list, shops: r.failedShops.map((s) => s.name).join(', ') })
    : tr(t.checkout.success, { list });
}
