import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errMsg } from './api';

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
 * Sahifalangan ro'yxat (API: ?page=N → { page, total, hasMore, items }).
 * Eski javoblar (masalan, qidiruv o'zgarganda kech kelgan javob) e'tiborsiz qoldiriladi.
 */
export function usePaged<T>(path: string | null) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0);
  const busyMore = useRef(false);
  const loaded = useRef(false);

  const url = useCallback((p: number) => {
    if (!path) return '';
    return `${path}${path.includes('?') ? '&' : '?'}page=${p}`;
  }, [path]);

  const loadFirst = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    if (!path) return;
    const id = ++gen.current;
    busyMore.current = false;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const r = await api<PageResp<T>>(url(1));
      if (id !== gen.current) return;
      setItems(r.items); setTotal(r.total); setHasMore(r.hasMore); setPage(r.page);
      setError(null);
      loaded.current = true;
    } catch (e) {
      if (id !== gen.current) return;
      setError(errMsg(e));
    } finally {
      if (id === gen.current) { setLoading(false); setRefreshing(false); setLoadingMore(false); }
    }
  }, [path, url]);

  // Yo'l (filtr/qidiruv) o'zgarsa — boshidan
  useEffect(() => { loaded.current = false; loadFirst('initial'); }, [loadFirst]);

  const loadMore = useCallback(async () => {
    if (!hasMore || busyMore.current || loading) return;
    busyMore.current = true;
    const id = gen.current;
    setLoadingMore(true);
    try {
      const r = await api<PageResp<T>>(url(page + 1));
      if (id !== gen.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((x) => (x as { id?: string }).id));
        return [...prev, ...r.items.filter((x) => !seen.has((x as { id?: string }).id))];
      });
      setTotal(r.total); setHasMore(r.hasMore); setPage(r.page);
    } catch (e) {
      if (id === gen.current) setError(errMsg(e));
    } finally {
      if (id === gen.current) { setLoadingMore(false); busyMore.current = false; }
    }
  }, [hasMore, loading, page, url]);

  const refresh = useCallback(() => loadFirst('refresh'), [loadFirst]);
  const retry = useCallback(() => loadFirst('initial'), [loadFirst]);
  /** Ekranga qaytganda — spinner'siz yangilash */
  const reloadSilently = useCallback(() => { if (loaded.current) loadFirst('silent'); }, [loadFirst]);

  return { items, total, hasMore, loading, refreshing, loadingMore, error, loadMore, refresh, retry, reloadSilently };
}

/** Bitta resursni yuklash (detal ekranlari). */
export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
    if (!path) return;
    const id = ++gen.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const r = await api<T>(path);
      if (id !== gen.current) return;
      setData(r); setError(null);
    } catch (e) {
      if (id === gen.current) setError(errMsg(e));
    } finally {
      if (id === gen.current) { setLoading(false); setRefreshing(false); }
    }
  }, [path]);

  useEffect(() => { load('initial'); }, [load]);

  const refresh = useCallback(() => load('refresh'), [load]);
  const retry = useCallback(() => load('initial'), [load]);
  const reloadSilently = useCallback(() => load('silent'), [load]);

  return { data, loading, refreshing, error, setData, refresh, retry, reloadSilently };
}
