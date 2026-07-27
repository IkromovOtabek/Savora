import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, clearToken, getToken } from './api';

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
}

/** Standart atamalar — me hali yuklanmagan bo'lsa. */
export const DEFAULT_TERMS: Terms = { item: 'Mahsulot', items: 'Ombor', addItem: 'Mahsulot qo\'shish', codeLabel: 'Kod / shtrix', hasImei: false };

interface AuthState {
  loading: boolean;
  me: MeResponse | null;
  login: (username: string, password: string, slug?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) { setMe(null); return; }
    try {
      const data = await api<MeResponse>('/api/mobile/me');
      setMe(data);
    } catch {
      await clearToken();
      setMe(null);
    }
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setLoading(false); })();
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
    setMe(null);
  }, []);

  return (
    <AuthContext.Provider value={{ loading, me, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth AuthProvider ichida bo\'lishi kerak');
  return ctx;
}
