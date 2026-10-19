import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, setToken, clearToken, getToken, setUnauthorizedHandler, ApiError, errMsg } from './api';

/** Oxirgi muvaffaqiyatli profil — internetsiz ochilganda ilova (oflayn sotuv) ishlashi uchun */
const ME_CACHE_KEY = 'savora_me_cache';
async function cacheMe(me: MeResponse | null) {
  try {
    if (me) await AsyncStorage.setItem(ME_CACHE_KEY, JSON.stringify(me));
    else await AsyncStorage.removeItem(ME_CACHE_KEY);
  } catch { /* kesh ixtiyoriy */ }
}
async function cachedMe(): Promise<MeResponse | null> {
  try {
    const raw = await AsyncStorage.getItem(ME_CACHE_KEY);
    return raw ? (JSON.parse(raw) as MeResponse) : null;
  } catch { return null; }
}

export interface Terms {
  item: string;    // "Mahsulot" / "Taom" / "Dori" ...
  items: string;   // "Ombor" / "Menyu" / "Dorixona"
  addItem: string; // "Mahsulot qo'shish" ...
  codeLabel: string;
  hasImei: boolean;
}

/** Mahsulot formasining yo'nalishga xos maydonlari (server: web/lib/businessTypes.ts → PRODUCT_FIELDS) */
export type ProductFieldKey = 'category' | 'unit' | 'size' | 'color' | 'warrantyMonths' | 'batchNumber' | 'expiryDate' | 'oemCode';
export interface ProductFieldSpec { key: ProductFieldKey; required?: boolean }

export interface MeResponse {
  user: { id: string; username: string; role: 'admin' | 'user'; isAdmin: boolean };
  org: { name: string; slug: string; active: boolean; daysLeft: number; isTrial: boolean; businessType: string; businessTypeLabel: string };
  terms: Terms;
  features: Record<string, boolean>;
  /** Xodim huquqlari (server: lib/permissions.ts). Eski server javobida bo'lmasligi mumkin. */
  permissions?: string[];
  /** Eski server javobida bo'lmasligi mumkin — unda faqat umumiy maydonlar */
  productFields?: ProductFieldSpec[];
  productUnits?: string[];
}

/** Standart atamalar — me hali yuklanmagan bo'lsa. */
export const DEFAULT_TERMS: Terms = { item: 'Mahsulot', items: 'Ombor', addItem: 'Mahsulot qo\'shish', codeLabel: 'Kod / shtrix', hasImei: false };

export interface RegisterInput { name: string; phone?: string; businessType: string; username: string; password: string; acceptTerms: true }

interface AuthState {
  loading: boolean;
  me: MeResponse | null;
  /** Token bor, lekin profil yuklanmadi (tarmoq xatosi) — chiqarib yubormaymiz. */
  error: string | null;
  /** Profil serverdan emas, qurilmadagi keshdan (internet yo'q) */
  fromCache: boolean;
  login: (username: string, password: string, slug?: string) => Promise<void>;
  /** Ilova ichida bepul do'kon ochish — muvaffaqiyatda darhol kiradi */
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) { setMe(null); setError(null); setFromCache(false); return; }
    try {
      const data = await api<MeResponse>('/api/mobile/me');
      setMe(data); setError(null); setFromCache(false);
      void cacheMe(data);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 404)) {
        await clearToken();
        void cacheMe(null);
        setMe(null); setError(null); setFromCache(false);
      } else if (e instanceof ApiError && e.status === 0) {
        // Internet yo'q — oxirgi profil bilan ishlaymiz (oflayn sotuv mumkin bo'lsin)
        const cached = await cachedMe();
        if (cached) { setMe((cur) => cur ?? cached); setFromCache(true); setError(null); }
        else setError(errMsg(e));
      } else {
        // Boshqa xato — tokenni saqlab qolamiz, foydalanuvchi qayta urinadi
        setError(errMsg(e));
      }
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { setMe(null); setError(null); void cacheMe(null); });
    (async () => { await refresh(); setLoading(false); })();
    return () => setUnauthorizedHandler(null);
  }, [refresh]);

  const login = useCallback(async (username: string, password: string, slug = '') => {
    // Slug'siz kirish — username global registrdan do'konni topadi (slug ixtiyoriy)
    const res = await api<{ token: string }>('/api/mobile/auth/login', {
      method: 'POST', auth: false, body: { slug, username, password },
    });
    await setToken(res.token);
    await refresh();
  }, [refresh]);

  const register = useCallback(async (input: RegisterInput) => {
    const res = await api<{ token: string }>('/api/mobile/auth/register', { method: 'POST', auth: false, body: input });
    await setToken(res.token);
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await clearToken();
    void cacheMe(null);
    setMe(null); setError(null); setFromCache(false);
  }, []);

  return (
    <AuthContext.Provider value={{ loading, me, error, fromCache, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth AuthProvider ichida bo\'lishi kerak');
  return ctx;
}

/** Huquq tekshiruvi — tugmalarni yashirish uchun. Asosiy himoya serverda. */
export function useCan(): (key: string) => boolean {
  const { me } = useAuth();
  return (key: string) => {
    if (!me) return false;
    if (me.user.isAdmin) return true;
    return me.permissions ? me.permissions.includes(key) : true;
  };
}
