import { logError } from '@/lib/logger';
import { hitRateLimit } from '@/lib/rateLimit';
import { MXIK_SITE_URL, normalizeMxikQuery, toMxikItem, type MxikItem } from '@/lib/mxik';

/**
 * MXIK katalogidan qidiruv — server tomonda proksi (brauzer tasnif.soliq.uz'ga to'g'ridan-to'g'ri bormaydi).
 * Manba: tasnif.soliq.uz saytining o'zi ishlatadigan ochiq JSON API (kalit talab qilinmaydi, robots.txt
 * cheklamaydi; rasmiy hujjatlashtirilmagan — o'zgarishi mumkin, docs/SOLIQ.md). Tashqi so'rovga faqat
 * qidiruv matni va til yuboriladi — do'kon, foydalanuvchi yoki mijoz ma'lumoti yuborilmaydi.
 *  - kesh: 12 soat (katalog kam o'zgaradi), xatolar keshlanmaydi;
 *  - timeout: 6 s; xato/timeout bo'lsa — rasmiy saytga havola bilan javob;
 *  - rate-limit: foydalanuvchiga 30/daq, butun server bo'yicha 600/daq (tashqi xizmatni yuklamaslik uchun).
 */

const API_BASE = 'https://tasnif.soliq.uz/api/cls-api';
const TIMEOUT_MS = 6000;
const PAGE_SIZE = 20;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_MAX = 1000;

const globalForCache = global as unknown as { _savoraMxikCache?: Map<string, { at: number; items: MxikItem[] }> };
const cache = globalForCache._savoraMxikCache ?? new Map<string, { at: number; items: MxikItem[] }>();
globalForCache._savoraMxikCache = cache;

export type MxikLang = 'uz' | 'ru';
export type MxikSearchResult =
  | { ok: true; items: MxikItem[]; cached: boolean }
  | { ok: false; reason: 'badQuery' | 'rateLimited' | 'unavailable'; retryAfterSec?: number };

/** Faqat testlar uchun */
export function clearMxikCache(): void {
  cache.clear();
}

/** Katalogdan qidirish (nom, kod yoki shtrix-kod bo'yicha) — kesh bilan */
export async function searchMxikCatalog(rawQuery: unknown, lang: MxikLang, fetchImpl: typeof fetch = fetch): Promise<MxikSearchResult> {
  const q = normalizeMxikQuery(rawQuery);
  if (!q) return { ok: false, reason: 'badQuery' };
  const key = `${lang}:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    // LRU: oxirgi ishlatilgani oxiriga
    cache.delete(key);
    cache.set(key, hit);
    return { ok: true, items: hit.items, cached: true };
  }

  const url = `${API_BASE}/elasticsearch/search?${new URLSearchParams({ search: q, page: '0', size: String(PAGE_SIZE), lang })}`;
  try {
    const res = await fetchImpl(url, {
      headers: { accept: 'application/json', 'User-Agent': 'Savora/1.0 (+https://savora.uz)' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, reason: 'unavailable' };
    const body = (await res.json()) as { success?: boolean; data?: unknown };
    if (!body || body.success !== true || !Array.isArray(body.data)) return { ok: false, reason: 'unavailable' };
    const seen = new Set<string>();
    const items: MxikItem[] = [];
    for (const raw of body.data.slice(0, PAGE_SIZE)) {
      const item = toMxikItem(raw);
      if (item && !seen.has(item.code)) { seen.add(item.code); items.push(item); }
    }
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), items });
    return { ok: true, items, cached: false };
  } catch (err) {
    // Timeout/tarmoq — forma baribir ishlaydi (qo'lda kiritish + rasmiy sayt havolasi)
    if (!(err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError'))) logError('mxik.search', err);
    return { ok: false, reason: 'unavailable' };
  }
}

/** API javobi (web va mobil marshrutlar uchun umumiy): rate-limit + qidiruv */
export async function mxikSearchResponse(
  rateKey: string,
  rawQuery: string | null,
  lang: MxikLang,
  msgs: { badQuery: string; rateLimited: string; unavailable: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const q = normalizeMxikQuery(rawQuery);
  if (!q) return { status: 400, body: { error: msgs.badQuery } };
  const [own, all] = await Promise.all([
    hitRateLimit(`mxik:${rateKey}`, 30, 60_000),
    hitRateLimit('mxik:all', 600, 60_000),
  ]);
  if (!own.ok || !all.ok) {
    return { status: 429, body: { error: msgs.rateLimited, retryAfterSec: own.retryAfterSec ?? all.retryAfterSec } };
  }
  const r = await searchMxikCatalog(q, lang);
  if (!r.ok) return { status: 502, body: { error: msgs.unavailable, siteUrl: MXIK_SITE_URL } };
  return { status: 200, body: { items: r.items, source: MXIK_SITE_URL } };
}
