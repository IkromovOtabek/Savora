import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, ApiError } from './api';

/**
 * Savora Market xaridori (alohida akkaunt: ism + telefon + parol). Biznes sessiyasidan (lib/auth) mustaqil:
 * o'z tokeni bilan `api(..., { token })` chaqiriladi — biznes tokeni yuborilmaydi, 401 biznesdan chiqarmaydi.
 * Profil ham saqlanadi: internetsiz ochilganda xaridor «kirgan» holatda qoladi.
 */
const TOKEN_KEY = 'savora_buyer_token';
const PROFILE_KEY = 'savora_buyer_profile';

export interface Buyer { id: string; name: string; phone: string; address?: string }

type ReqOpts = Omit<NonNullable<Parameters<typeof api>[1]>, 'token' | 'auth'>;

interface BuyerState {
  /** Saqlangan token o'qildi */
  ready: boolean;
  buyer: Buyer | null;
  token: string | null;
  login: (phone: string, password: string) => Promise<void>;
  register: (name: string, phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Xaridor tokeni bilan so'rov; token bekor bo'lsa (401) — xaridor chiqariladi */
  request: <T>(path: string, opts?: ReqOpts) => Promise<T>;
}

const BuyerContext = createContext<BuyerState | null>(null);

async function readStore(key: string): Promise<string | null> {
  try { return await SecureStore.getItemAsync(key); } catch { return null; }
}
async function writeStore(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch { /* saqlanmasa — sessiya davomida ishlaydi */ }
}
function parseBuyer(raw: string | null): Buyer | null {
  if (!raw) return null;
  try {
    const b = JSON.parse(raw) as Buyer;
    return b && typeof b.id === 'string' && typeof b.phone === 'string' ? b : null;
  } catch { return null; }
}

export function BuyerProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  const apply = useCallback(async (t: string | null, b: Buyer | null) => {
    tokenRef.current = t;
    setTokenState(t);
    setBuyer(b);
    await Promise.all([writeStore(TOKEN_KEY, t), writeStore(PROFILE_KEY, b ? JSON.stringify(b) : null)]);
  }, []);

  const refresh = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    try {
      const r = await api<{ buyer: Buyer }>('/api/market/me', { token: t, force: true });
      if (tokenRef.current !== t) return;
      setBuyer(r.buyer);
      void writeStore(PROFILE_KEY, JSON.stringify(r.buyer));
    } catch (e) {
      // Token eskirgan — faqat xaridor chiqadi; tarmoq xatosida saqlangan profil bilan qolamiz
      if (e instanceof ApiError && e.status === 401 && tokenRef.current === t) await apply(null, null);
    }
  }, [apply]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [t, p] = await Promise.all([readStore(TOKEN_KEY), readStore(PROFILE_KEY)]);
      if (!alive) return;
      tokenRef.current = t;
      setTokenState(t);
      setBuyer(t ? parseBuyer(p) : null);
      setReady(true);
      if (t) void refresh();
    })();
    return () => { alive = false; };
  }, [refresh]);

  const login = useCallback(async (phone: string, password: string) => {
    const r = await api<{ token: string; buyer: Buyer }>('/api/market/auth/login', { method: 'POST', token: null, body: { phone, password } });
    await apply(r.token, r.buyer);
  }, [apply]);

  const register = useCallback(async (name: string, phone: string, password: string) => {
    const r = await api<{ token: string; buyer: Buyer }>('/api/market/auth/register', { method: 'POST', token: null, body: { name, phone, password } });
    await apply(r.token, r.buyer);
  }, [apply]);

  const logout = useCallback(async () => { await apply(null, null); }, [apply]);

  const request = useCallback(async <T,>(path: string, opts: ReqOpts = {}): Promise<T> => {
    const t = tokenRef.current;
    try {
      return await api<T>(path, { ...opts, token: t });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && t && tokenRef.current === t) await apply(null, null);
      throw e;
    }
  }, [apply]) as BuyerState['request'];

  const value = useMemo<BuyerState>(
    () => ({ ready, buyer: token ? buyer : null, token, login, register, logout, refresh, request }),
    [ready, buyer, token, login, register, logout, refresh, request],
  );
  return <BuyerContext.Provider value={value}>{children}</BuyerContext.Provider>;
}

export function useBuyer(): BuyerState {
  const ctx = useContext(BuyerContext);
  if (!ctx) throw new Error('useBuyer BuyerProvider ichida bo\'lishi kerak');
  return ctx;
}
