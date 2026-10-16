import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { getDict, tr } from './i18n';

const TOKEN_KEY = 'savora_token';
const TIMEOUT_MS = 15000;

/** API manzili — app.json > extra.apiUrl (yoki EXPO_PUBLIC_API_URL) */
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiUrl as string) ||
  'https://savora.uz';

export async function getToken(): Promise<string | null> {
  try { return await SecureStore.getItemAsync(TOKEN_KEY); } catch { return null; }
}
export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}
export async function clearToken(): Promise<void> {
  try { await SecureStore.deleteItemAsync(TOKEN_KEY); } catch { /* token yo'q bo'lsa — muammo emas */ }
}

/** Server/ tarmoq xatosi — status 0 = tarmoq yoki vaqt tugashi. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** 401 bo'lganda chaqiriladi (auth provayderi o'rnatadi → logout). */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) { onUnauthorized = fn; }

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const useAuth = opts.auth !== false;
  if (useAuth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    const aborted = (e as { name?: string })?.name === 'AbortError';
    throw new ApiError(
      aborted ? getDict().api.timeout : getDict().api.offline,
      0,
    );
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && useAuth) {
      await clearToken();
      onUnauthorized?.();
    }
    throw new ApiError((data as { error?: string }).error || tr(getDict().api.httpError, { status: res.status }), res.status);
  }
  return data as T;
}

/** Xatodan foydalanuvchiga ko'rsatiladigan matn. */
export function errMsg(e: unknown, fallback?: string): string {
  return e instanceof Error && e.message ? e.message : (fallback ?? getDict().common.errorGeneric);
}
