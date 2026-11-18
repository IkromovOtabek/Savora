import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { QueryClient, hydrate, onlineManager, type Query } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { persistQueryClientSubscribe, type PersistedQueryClientSaveOptions } from '@tanstack/react-query-persist-client';
import { getNetState, subscribeNet } from './net';
import { fitPersisted, type PersistedClientLike } from './cacheFit';

/**
 * O'qish keshi (TanStack Query) va uning telefonda saqlanishi (AsyncStorage).
 *  - Ekranlar avval keshdan ochiladi, fonda yangilanadi (staleTime 0 — har ochilishda tekshiradi).
 *  - Tarmoqqa chiqish qarorini `api()` o'zi qiladi: oflaynda GET darhol xato, kesh ko'rinib turadi
 *    (networkMode 'always' — so'rov «pauza»da qotib qolmaydi, ekran xato turini biladi).
 *  - onlineManager `net.ts` holatiga ulangan: internet qaytsa ochiq ekranlar o'zi yangilanadi.
 *  - Kesh foydalanuvchi + ilova versiyasi bilan bog'langan (buster); chiqishda o'chiriladi.
 */

/** Kesh qancha vaqt yaroqli (tiklashda bundan eskisi tashlanadi) — 3 kun */
export const CACHE_MAX_AGE_MS = 72 * 3600_000;
/** Saqlanadigan so'rovlar xotirada ham shuncha turadi (aks holda saqlashdan ham tushib qoladi) */
export const CACHE_GC_MS = CACHE_MAX_AGE_MS;
/** Qidiruv natijalari kabi saqlanmaydiganlar — 5 daqiqa */
export const SHORT_GC_MS = 5 * 60_000;
/** Javob tuzilmasi mos kelmay qoladigan o'zgarishda oshiring — eski kesh tashlanadi */
const CACHE_SCHEMA = 1;
const STORAGE_KEY = 'savora_query_cache';
const APP_VERSION = Constants.expoConfig?.version ?? '0';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'always',
      staleTime: 0,
      gcTime: SHORT_GC_MS,
      // Avvalgidek: xato darhol ko'rinadi (qayta urinish — foydalanuvchi yoki internet qaytganda)
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: { networkMode: 'always', retry: false },
  },
});

// TanStack «onlayn»i = net.ts holati offline emas (sekin ham onlayn: so'rovlar boradi)
onlineManager.setEventListener((setOnline) => {
  setOnline(getNetState() !== 'offline');
  return subscribeNet(() => setOnline(getNetState() !== 'offline'));
});

/** Faol foydalanuvchi buster'i — boshqasiniki (chiqib ketgan) kechikib yozilmasin */
let activeBuster: string | null = null;
let unsubscribe: (() => void) | null = null;
/** Har start/stop'da oshadi — eski (tugamagan) tiklash keyin obuna ochmasin */
let generation = 0;

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: STORAGE_KEY,
  throttleTime: 3000,
  // Yozish paytida (throttle'dan keyin) tekshiriladi: logout'dan keyin eski foydalanuvchi keshi qaytib yozilmaydi
  serialize: (client) => {
    if (client.buster !== activeBuster) throw new Error('stale cache owner');
    return fitPersisted(client as unknown as PersistedClientLike);
  },
  // Yozilmasa (xotira to'la yoki egasi almashgan) — taslim: keyingi o'zgarishda qayta urinadi
  retry: () => undefined,
});

/** Saqlanadimi: ma'lumoti bor, 3 kundan eski emas va `meta.persist !== false` (qidiruv natijalari saqlanmaydi) */
function shouldPersist(q: Query): boolean {
  return q.state.data !== undefined && q.meta?.persist !== false && Date.now() - q.state.dataUpdatedAt < CACHE_MAX_AGE_MS;
}


/**
 * Foydalanuvchi aniqlangach: saqlangan keshni tiklaydi va keyingi o'zgarishlarni saqlab boradi.
 * userId null (kirmagan) — saqlash yo'q. Buster boshqa bo'lsa (boshqa foydalanuvchi/versiya) — eski kesh o'chadi.
 */
export async function startCachePersist(userId: string | null): Promise<void> {
  stopCachePersist();
  if (!userId) return;
  const my = generation;
  const buster = `${userId}|${APP_VERSION}|${CACHE_SCHEMA}`;
  activeBuster = buster;
  // persistQueryClientRestore o'rniga: o'qish va hydrate orasida chiqib ketilgan bo'lsa (logout), eski
  // foydalanuvchi ma'lumoti xotiraga tushmasin — tekshiruv aynan hydrate oldidan
  try {
    const saved = await persister.restoreClient();
    if (my !== generation) return;
    if (saved) {
      const expired = !saved.timestamp || Date.now() - saved.timestamp > CACHE_MAX_AGE_MS;
      if (expired || saved.buster !== buster) await persister.removeClient();
      // Tiklangan so'rovlar ekran ochilmaguncha ham xotirada tursin (standart 5 daqiqada o'chib, saqlashdan ham tushardi)
      else hydrate(queryClient, saved.clientState, { defaultOptions: { queries: { gcTime: CACHE_GC_MS } } });
    }
  } catch {
    // Buzilgan kesh — o'chiramiz, bo'sh boshlaymiz
    try { await persister.removeClient(); } catch { /* keyingi saqlash ustidan yozadi */ }
  }
  if (my !== generation) return;
  const opts: PersistedQueryClientSaveOptions = {
    queryClient,
    persister,
    buster,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersist, shouldDehydrateMutation: () => false },
  };
  unsubscribe = persistQueryClientSubscribe(opts);
}

export function stopCachePersist() {
  generation++;
  unsubscribe?.();
  unsubscribe = null;
  activeBuster = null;
}

/** Chiqish (logout / 401): xotiradagi va telefondagi kesh o'chadi */
export async function clearQueryCache(): Promise<void> {
  stopCachePersist();
  queryClient.clear();
  try { await persister.removeClient(); } catch { /* o'chmasa — keyingi kirishda buster mos kelmaydi */ }
}
