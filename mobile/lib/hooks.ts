import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  keepPreviousData, skipToken, useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type QueryKey,
} from '@tanstack/react-query';
import { api, ApiError, errMsg, type ApiErrorKind } from './api';
import { useNetState } from './net';
import { CACHE_GC_MS, SHORT_GC_MS } from './queryClient';

/** Qiymatni kechiktirib beradi (qidiruv uchun). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export interface PageResp<T> { page: number; total: number; hasMore: boolean; items: T[] }

/**
 * O'qish hook'lari TanStack Query ustida (kesh telefonda saqlanadi — lib/queryClient.ts).
 * Ekranlar uchun API avvalgidek; qo'shimcha maydonlar:
 *  - errorKind — xato turi ('network' | 'timeout' | 'http'), tarjima matni bilan solishtirish o'rniga;
 *  - updatedAt — ko'rsatilayotgan ma'lumot serverdan olingan vaqt (kesh vaqti);
 *  - fromCache — ma'lumot eskirgan bo'lishi mumkin (oflayn/sekin yoki yangilash tarmoq sababli o'tmadi) →
 *    ekran «Yangilangan: 14:32» ko'rsatadi (<CacheStamp of={...} />);
 *  - fetching — fonda yangilanmoqda.
 * Kesh ko'rinib turganda tarmoq xatosi `error` sifatida berilmaydi (tepadagi chiziq va kesh vaqti yetarli);
 * server xatosi (http) — avvalgidek.
 */
export interface CacheView {
  error: string | null;
  errorKind: ApiErrorKind | null;
  updatedAt: number | null;
  fromCache: boolean;
  fetching: boolean;
}

/** Qidiruv natijalari (q= bo'sh emas) telefonda saqlanmaydi — faqat asosiy ro'yxatlar */
function persistable(path: string | null): boolean {
  return !!path && !/[?&]q=[^&]/.test(path);
}

function useCacheView(q: { data: unknown; dataUpdatedAt: number; isFetching: boolean; error: unknown; isPlaceholderData: boolean }): CacheView {
  const net = useNetState();
  const hasData = q.data !== undefined && !q.isPlaceholderData;
  const errorKind: ApiErrorKind | null = q.error ? (q.error instanceof ApiError ? q.error.kind : 'http') : null;
  const netErr = errorKind === 'network' || errorKind === 'timeout';
  const updatedAt = hasData && q.dataUpdatedAt > 0 ? q.dataUpdatedAt : null;
  return {
    error: q.error && !(netErr && hasData) ? errMsg(q.error) : null,
    errorKind,
    updatedAt,
    // Onlaynda ko'rsatilmaydi: fonda yangilanish bir zumda tugaydi, satr miltillamasin
    fromCache: updatedAt !== null && (net !== 'online' || netErr),
    fetching: q.isFetching,
  };
}

const pageUrl = (path: string, p: number) => `${path}${path.includes('?') ? '&' : '?'}page=${p}`;

/**
 * Sahifalangan ro'yxat (API: ?page=N → { page, total, hasMore, items }).
 * Telefonda faqat 1-sahifa saqlanadi; yangilash (tortish, ekranga qaytish) — 1-sahifadan boshlab.
 * Qidiruv/filtr o'zgarsa — yangi javob kelguncha oldingi ro'yxat ko'rinib turadi (loading = true).
 */
export function usePaged<T>(path: string | null) {
  const qc = useQueryClient();
  const key = useMemo<QueryKey>(() => ['paged', path], [path]);
  const persist = persistable(path);
  // Foydalanuvchi o'zi so'radi (tortdi, «Qayta urinish») — oflayn holatda ham tarmoqqa chiqiladi
  const force = useRef(false);

  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: path
      ? ({ pageParam }) => {
          const f = force.current;
          force.current = false;
          return api<PageResp<T>>(pageUrl(path, pageParam), { force: f });
        }
      : skipToken,
    initialPageParam: 1,
    getNextPageParam: (last: PageResp<T>) => (last.hasMore ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    gcTime: persist ? CACHE_GC_MS : SHORT_GC_MS,
    meta: { persist },
  });
  const view = useCacheView(q);

  const pages = q.data?.pages;
  const items = useMemo(() => {
    const out: T[] = [];
    if (!pages) return out;
    // Sahifalar orasida siljish bo'lsa (yangi yozuv qo'shildi) — takror chiqmasin
    const seen = new Set<unknown>();
    for (const p of pages) {
      for (const x of p.items) {
        const id = (x as { id?: unknown }).id;
        if (id !== undefined) {
          if (seen.has(id)) continue;
          seen.add(id);
        }
        out.push(x);
      }
    }
    return out;
  }, [pages]);
  const total = pages && pages.length ? pages[pages.length - 1].total : 0;
  const loading = q.isPending || q.isPlaceholderData;

  // Qaytariladigan funksiyalar barqaror (useFocusEffect bog'liqligi — aks holda har chizishda qayta yuklardi)
  const live = useRef({ q, key, path, loading });
  live.current = { q, key, path, loading };

  const reloadFirst = useCallback(async (user: boolean) => {
    const { q: cur, key: k, path: p } = live.current;
    if (!p) return;
    const data = qc.getQueryData<InfiniteData<PageResp<T>, number>>(k);
    if (data && data.pages.length > 1) {
      // Faqat 1-sahifani qayta so'raymiz (TanStack aks holda hamma yuklangan sahifani qayta oladi); kesh vaqti o'zgarmaydi
      qc.setQueryData<InfiniteData<PageResp<T>, number>>(
        k,
        { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) },
        { updatedAt: qc.getQueryState(k)?.dataUpdatedAt },
      );
    }
    if (user) force.current = true;
    await cur.refetch({ cancelRefetch: user || cur.isFetchingNextPage });
  }, [qc]);

  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await reloadFirst(true); } finally { setRefreshing(false); }
  }, [reloadFirst]);
  const retry = useCallback(() => { void reloadFirst(true); }, [reloadFirst]);
  /** Ekranga qaytganda — spinner'siz yangilash */
  const reloadSilently = useCallback(() => {
    if (live.current.q.data !== undefined) void reloadFirst(false);
  }, [reloadFirst]);
  const loadMore = useCallback(() => {
    const { q: cur, loading: busy } = live.current;
    if (!cur.hasNextPage || cur.isFetchingNextPage || busy) return;
    void cur.fetchNextPage({ cancelRefetch: false });
  }, []);

  return {
    items, total, hasMore: !!q.hasNextPage, loading, refreshing, loadingMore: q.isFetchingNextPage,
    ...view, loadMore, refresh, retry, reloadSilently,
  };
}

type SetData<T> = (v: T | null | ((prev: T | null) => T | null)) => void;

/**
 * Keshdagi qiymatni almashtirish. keepTime — optimistik (mahalliy) o'zgarish: «Yangilangan» vaqti serverdan
 * olingan vaqtligicha qoladi; aks holda (server javobi) — hozirgi vaqt.
 */
function useSetCached<T>(keyRef: { current: QueryKey }, keepTime: boolean): SetData<T> {
  const qc = useQueryClient();
  return useCallback<SetData<T>>((v) => {
    const k = keyRef.current;
    const at = keepTime ? qc.getQueryState(k)?.dataUpdatedAt : undefined;
    qc.setQueryData<T>(
      k,
      (old) => {
        const next = typeof v === 'function' ? (v as (p: T | null) => T | null)(old ?? null) : v;
        return next ?? undefined;
      },
      at ? { updatedAt: at } : undefined,
    );
  }, [qc, keyRef, keepTime]);
}

/** Bitta resursni yuklash (detal ekranlari). Keshdan darhol, fonda yangilanadi. */
export function useResource<T>(path: string | null) {
  const key = useMemo<QueryKey>(() => ['res', path], [path]);
  const persist = persistable(path);
  const force = useRef(false);

  const q = useQuery({
    queryKey: key,
    queryFn: path
      ? () => {
          const f = force.current;
          force.current = false;
          return api<T>(path, { force: f });
        }
      : skipToken,
    placeholderData: keepPreviousData,
    gcTime: persist ? CACHE_GC_MS : SHORT_GC_MS,
    meta: { persist },
  });
  const view = useCacheView(q);

  const live = useRef({ q, path });
  live.current = { q, path };
  const keyRef = useRef(key);
  keyRef.current = key;
  const setData = useSetCached<T>(keyRef, true);

  const reload = useCallback(async (user: boolean) => {
    const { q: cur, path: p } = live.current;
    if (!p) return;
    if (user) force.current = true;
    await cur.refetch({ cancelRefetch: user });
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await reload(true); } finally { setRefreshing(false); }
  }, [reload]);
  const retry = useCallback(() => { void reload(true); }, [reload]);
  const reloadSilently = useCallback(() => { void reload(false); }, [reload]);

  return {
    data: (q.data ?? null) as T | null,
    loading: q.isPending || q.isPlaceholderData,
    refreshing, ...view, setData, refresh, retry, reloadSilently,
  };
}

/**
 * useState kabi, lekin qiymat o'qish keshida (telefonda saqlanadi): ekran qayta ochilganda yoki internet yo'q paytda
 * oxirgi qiymat darhol ko'rinadi. Yuklashni ekranning o'zi qiladi (o'z polling'i bilan) — masalan, restoran stollari.
 * Qaytaradi: [qiymat, o'rnatish, serverdan olingan vaqt].
 */
export function useCachedState<T>(key: QueryKey): [T | null, SetData<T>, number | null] {
  const q = useQuery<T>({ queryKey: key, queryFn: skipToken, gcTime: CACHE_GC_MS, meta: { persist: true } });
  const keyRef = useRef(key);
  keyRef.current = key;
  const set = useSetCached<T>(keyRef, false);
  return [q.data ?? null, set, q.data !== undefined && q.dataUpdatedAt > 0 ? q.dataUpdatedAt : null];
}
