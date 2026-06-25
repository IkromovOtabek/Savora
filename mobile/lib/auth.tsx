import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, clearToken, getToken } from './api';

export interface MeResponse {
  user: { id: string; username: string; role: 'admin' | 'user'; isAdmin: boolean };
  org: { name: string; slug: string; active: boolean; daysLeft: number; isTrial: boolean };
  features: Record<string, boolean>;
}

interface AuthState {
  loading: boolean;
  me: MeResponse | null;
  login: (slug: string, username: string, password: string) => Promise<void>;
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

  const login = useCallback(async (slug: string, username: string, password: string) => {
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
