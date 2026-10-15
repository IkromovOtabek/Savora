import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, clearToken, getToken, setUnauthorizedHandler, ApiError, errMsg } from './api';

export interface Terms {
  item: string;    // "Mahsulot" / "Taom" / "Dori" ...
  items: string;   // "Ombor" / "Menyu" / "Dorixona"
  addItem: string; // "Mahsulot qo'shish" ...
  codeLabel: string;
  hasImei: boolean;
}

export interface MeResponse {
  user: { id: string; username: string; role: 'admin' | 'user'; isAdmin: boolean };
  org: { name: string; slug: string; active: boolean; daysLeft: number; isTrial: boolean; businessType: string; businessTypeLabel: string };
  terms: Terms;
  features: Record<string, boolean>;
  /** Xodim huquqlari (server: lib/permissions.ts). Eski server javobida bo'lmasligi mumkin. */
  permissions?: string[];
}

/** Standart atamalar — me hali yuklanmagan bo'lsa. */
export const DEFAULT_TERMS: Terms = { item: 'Mahsulot', items: 'Ombor', addItem: 'Mahsulot qo\'shish', codeLabel: 'Kod / shtrix', hasImei: false };

interface AuthState {
  loading: boolean;
  me: MeResponse | null;
  /** Token bor, lekin profil yuklanmadi (tarmoq xatosi) — chiqarib yubormaymiz. */
  error: string | null;
  login: (username: string, password: string, slug?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) { setMe(null); setError(null); return; }
    try {
      const data = await api<MeResponse>('/api/mobile/me');
      setMe(data); setError(null);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 404)) {
        await clearToken();
        setMe(null); setError(null);
      } else {
        // Tarmoq xatosi — tokenni saqlab qolamiz, foydalanuvchi qayta urinadi
        setError(errMsg(e));
      }
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { setMe(null); setError(null); });
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

  const logout = useCallback(async () => {
    await clearToken();
    setMe(null); setError(null);
  }, []);

  return (
    <AuthContext.Provider value={{ loading, me, error, login, logout, refresh }}>
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
