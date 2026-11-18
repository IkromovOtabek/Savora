/**
 * Telefonda saqlanadigan o'qish keshini (TanStack dehydrate natijasi) AsyncStorage chegarasiga sig'dirish.
 * SOF funksiyalar (importsiz, `node --test` bilan tekshiriladi); ishlatilishi — `queryClient.ts`.
 *
 * Nega chegara: Android AsyncStorage jami ~6 MB, bitta yozuv ~2 MB dan oshsa o'qib bo'lmaydi (CursorWindow).
 * Butun kesh bitta kalitda — shuning uchun 1 mln belgidan (UTF-8 da ~1–1,5 MB) oshmaydi.
 *  1) cheksiz ro'yxat (usePaged) — faqat 1-sahifa;
 *  2) bitta so'rov juda katta bo'lsa — eng uzun massivi yarmiga qisqartiriladi (sig'maguncha), bo'lmasa tashlanadi;
 *  3) jami sig'masa — eng eski yangilanganlari tashlanadi;
 *  4) holat «muvaffaqiyatli, tinch» ko'rinishga keltiriladi — tiklanganda eski xato/yuklanish ko'rinmasin.
 */

export const CACHE_MAX_CHARS = 1_000_000;
export const QUERY_MAX_CHARS = 250_000;

export interface PersistedQueryLike {
  queryKey: unknown;
  queryHash: string;
  state: { data?: unknown; dataUpdatedAt?: number; [k: string]: unknown };
  [k: string]: unknown;
}

export interface PersistedClientLike {
  buster: string;
  timestamp: number;
  clientState: { queries: PersistedQueryLike[]; mutations?: unknown[] };
}

interface InfiniteLike { pages: unknown[]; pageParams: unknown[] }

export function isInfinite(d: unknown): d is InfiniteLike {
  return !!d && typeof d === 'object' && Array.isArray((d as InfiniteLike).pages) && Array.isArray((d as InfiniteLike).pageParams);
}

/** Cheksiz ro'yxatdan faqat birinchi sahifa qoladi; boshqa ma'lumot o'zgarmaydi */
export function firstPageOnly(d: unknown): unknown {
  if (!isInfinite(d) || d.pages.length <= 1) return d;
  return { pages: d.pages.slice(0, 1), pageParams: d.pageParams.slice(0, 1) };
}

/** Eng uzun massivni (yuqori darajada yoki cheksiz ro'yxatning 1-sahifasida) yarmiga qisqartiradi; iloji bo'lmasa — null */
export function halveLargestArray(d: unknown): unknown | null {
  if (isInfinite(d)) {
    if (d.pages.length === 0) return null;
    const p = halveLargestArray(d.pages[0]);
    return p === null ? null : { pages: [p, ...d.pages.slice(1)], pageParams: d.pageParams };
  }
  if (Array.isArray(d)) return d.length >= 2 ? d.slice(0, Math.ceil(d.length / 2)) : null;
  if (!d || typeof d !== 'object') return null;
  let best: string | null = null;
  let bestLen = 1;
  for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
    if (Array.isArray(v) && v.length > bestLen) { best = k; bestLen = v.length; }
  }
  if (best === null) return null;
  const arr = (d as Record<string, unknown[]>)[best];
  return { ...(d as Record<string, unknown>), [best]: arr.slice(0, Math.ceil(arr.length / 2)) };
}

function cleanQuery(q: PersistedQueryLike, data: unknown): PersistedQueryLike {
  // `promise` — faqat yuklanayotgan so'rovda bo'ladi, JSON'da ma'nosiz
  const { promise: _promise, ...rest } = q;
  void _promise;
  return {
    ...rest,
    state: {
      ...q.state,
      data,
      status: 'success',
      fetchStatus: 'idle',
      error: null,
      errorUpdateCount: 0,
      fetchFailureCount: 0,
      fetchFailureReason: null,
      isInvalidated: false,
    },
  };
}

function stringifyOrNull(v: unknown): string | null {
  try { return JSON.stringify(v); } catch { return null; }
}

/** Bitta so'rov — chegaraga sig'adigan JSON yoki null (sig'masa / ma'lumot yo'q) */
export function fitQuery(q: PersistedQueryLike, perQueryMax: number = QUERY_MAX_CHARS): string | null {
  if (q.state.data === undefined) return null;
  let data = firstPageOnly(q.state.data);
  let s = stringifyOrNull(cleanQuery(q, data));
  while (s !== null && s.length > perQueryMax) {
    const next = halveLargestArray(data);
    if (next === null) return null;
    data = next;
    s = stringifyOrNull(cleanQuery(q, data));
  }
  return s;
}

/** Butun keshni chegaraga sig'dirib JSON satr qiladi (eng yangi yangilanganlar ustun) */
export function fitPersisted(
  client: PersistedClientLike,
  maxChars: number = CACHE_MAX_CHARS,
  perQueryMax: number = QUERY_MAX_CHARS,
): string {
  const head = JSON.stringify({ buster: client.buster, timestamp: client.timestamp, clientState: { mutations: [], queries: [] } });
  const sorted = [...client.clientState.queries].sort((a, b) => (b.state.dataUpdatedAt ?? 0) - (a.state.dataUpdatedAt ?? 0));
  const parts: string[] = [];
  let used = head.length;
  for (const q of sorted) {
    const s = fitQuery(q, perQueryMax);
    if (s === null) continue;
    const add = s.length + (parts.length ? 1 : 0);
    if (used + add > maxChars) continue; // kichikroq (eskiroq) so'rov hali sig'ishi mumkin
    parts.push(s);
    used += add;
  }
  // head oxiri: ..."queries":[]}}  → massiv ichiga qo'yamiz
  return `${head.slice(0, -3)}${parts.join(',')}]}}`;
}
