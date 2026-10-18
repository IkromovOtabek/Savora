import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './auth';
import { errMsg } from './api';
import {
  loadCatalog, refreshCatalog, loadQueue, enqueueSale, syncQueue, dismissQueued, isNetworkError,
  type Catalog, type QueuedSale, type SyncReport,
} from './offline';

/**
 * Oflayn POS holati butun ilova uchun: katalog, navbat, sinxron.
 *  - Kirgandan keyin va ilova oldinga chiqqanda: navbat yuboriladi, katalog yangilanadi.
 *  - Navbatda yuborilmagan sotuv bo'lsa — har 60 s qayta urinadi.
 * Native paket (NetInfo) ishlatilmaydi: "oflayn" — so'rov tarmoq xatosi bilan tugaganini bildiradi.
 */
interface OfflinePosState {
  catalog: Catalog | null;
  queue: QueuedSale[];
  pendingCount: number;
  problemCount: number;
  syncing: boolean;
  /** Oxirgi so'rov tarmoq xatosi bilan tugadi */
  offline: boolean;
  lastError: string | null;
  lastReport: SyncReport | null;
  enqueue: (sale: Omit<QueuedSale, 'clientSaleId' | 'soldAt' | 'status'>) => Promise<void>;
  syncNow: () => Promise<SyncReport | null>;
  refresh: () => Promise<void>;
  dismiss: (clientSaleId: string) => Promise<void>;
  markOffline: () => void;
}

const Ctx = createContext<OfflinePosState | null>(null);
const RETRY_MS = 60_000;
const CATALOG_TTL_MS = 5 * 60_000;

export function OfflinePosProvider({ children }: { children: React.ReactNode }) {
  const { me, fromCache, refresh: refreshMe } = useAuth();
  const userId = me?.user.id ?? null;
  const canSell = !!me && (me.features?.sales ?? true) && (!me.permissions || me.user.isAdmin || me.permissions.includes('sale.create'));

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastReport, setLastReport] = useState<SyncReport | null>(null);
  const uid = useRef(userId);
  uid.current = userId;

  const reload = useCallback(async () => {
    const id = uid.current;
    if (!id) { setCatalog(null); setQueue([]); return; }
    const [c, q] = await Promise.all([loadCatalog(id), loadQueue(id)]);
    if (uid.current !== id) return;
    setCatalog(c); setQueue(q);
  }, []);

  const syncNow = useCallback(async (): Promise<SyncReport | null> => {
    const id = uid.current;
    if (!id || !canSell) return null;
    setSyncing(true);
    try {
      const report = await syncQueue(id);
      setOffline(false); setLastError(null);
      if (report.sent > 0) setLastReport(report);
      // Internet qaytdi — keshdagi profilni serverdan yangilaymiz
      if (fromCache) void refreshMe();
      // Katalog: sotuv yuborilgan bo'lsa yoki 5 daqiqadan eski bo'lsa yangilanadi (trafikni tejash)
      const cat = await loadCatalog(id);
      const age = cat ? Date.now() - new Date(cat.savedAt).getTime() : Infinity;
      if (report.sent > 0 || !(age < CATALOG_TTL_MS)) {
        try { await refreshCatalog(id); } catch (e) { if (isNetworkError(e)) setOffline(true); }
      }
      return report;
    } catch (e) {
      if (isNetworkError(e)) setOffline(true);
      else setLastError(errMsg(e));
      return null;
    } finally {
      setSyncing(false);
      await reload();
    }
  }, [canSell, reload, fromCache, refreshMe]);

  const refresh = useCallback(async () => { await syncNow(); }, [syncNow]);

  const enqueue = useCallback(async (sale: Omit<QueuedSale, 'clientSaleId' | 'soldAt' | 'status'>) => {
    const id = uid.current;
    if (!id) throw new Error('no user');
    await enqueueSale(id, sale);
    setOffline(true);
    await reload();
  }, [reload]);

  const dismiss = useCallback(async (clientSaleId: string) => {
    const id = uid.current;
    if (!id) return;
    await dismissQueued(id, clientSaleId);
    await reload();
  }, [reload]);

  const markOffline = useCallback(() => setOffline(true), []);

  // Kirish/foydalanuvchi o'zgarishi: saqlanganini o'qish, keyin sinxron + katalog
  useEffect(() => {
    void reload().then(() => { if (userId && canSell) void syncNow(); });
  }, [userId, canSell, reload, syncNow]);

  // Ilova oldinga chiqqanda
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') void syncNow(); });
    return () => sub.remove();
  }, [syncNow]);

  const pendingCount = queue.filter((s) => s.status === 'pending').length;
  const problemCount = queue.length - pendingCount;

  // Yuborilmagan sotuv bor ekan — davriy qayta urinish
  useEffect(() => {
    if (pendingCount === 0) return;
    const t = setInterval(() => { void syncNow(); }, RETRY_MS);
    return () => clearInterval(t);
  }, [pendingCount, syncNow]);

  return (
    <Ctx.Provider value={{ catalog, queue, pendingCount, problemCount, syncing, offline, lastError, lastReport, enqueue, syncNow, refresh, dismiss, markOffline }}>
      {children}
    </Ctx.Provider>
  );
}

export function useOfflinePos(): OfflinePosState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOfflinePos OfflinePosProvider ichida ishlatilsin');
  return v;
}
