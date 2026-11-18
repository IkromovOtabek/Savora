import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { getDict, getLocale, tr } from './i18n';
import { getNetState, netReport, setNetPingUrl } from './net';

const TOKEN_KEY = 'savora_token';
const TIMEOUT_MS = 15000;

/** API manzili — app.json > extra.apiUrl (yoki EXPO_PUBLIC_API_URL) */
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiUrl as string) ||
  'https://savora.uz';

// Tarmoq holati pingi — liveness (DB'ga tegmaydi, doim 200)
setNetPingUrl(`${API_URL}/api/health?live=1`);

export async function getToken(): Promise<string | null> {
  try { return await SecureStore.getItemAsync(TOKEN_KEY); } catch { return null; }
}
export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}
export async function clearToken(): Promise<void> {
  try { await SecureStore.deleteItemAsync(TOKEN_KEY); } catch { /* token yo'q bo'lsa — muammo emas */ }
}

/**
 * Xato turi (tarjima matni bilan solishtirmang — til almashsa buziladi):
 *  - network — javob kelmadi (internet yo'q yoki oflayn holatda GET tarmoqqa chiqarilmadi);
 *  - timeout — vaqt tugadi: GET'da «qayta urining», POST'da «natija noma'lum» (server yozgan bo'lishi mumkin);
 *  - http    — server javob berdi (status ≥ 400).
 */
export type ApiErrorKind = 'network' | 'timeout' | 'http';

/** Server/ tarmoq xatosi — status 0 = javob yo'q (kind: network | timeout). */
export class ApiError extends Error {
  status: number;
  kind: ApiErrorKind;
  /** Server xato kodi (masalan restoran API: `sendFailed`, `conflict`) — bo'lmasligi mumkin */
  code?: string;
  /** Server qo'shimcha ma'lumoti (masalan `details.failed[]`) */
  details?: Record<string, unknown>;
  constructor(message: string, status: number, code?: string, details?: Record<string, unknown>, kind?: ApiErrorKind) {
    super(message);
    this.status = status;
    this.kind = kind ?? (status === 0 ? 'network' : 'http');
    this.code = code;
    this.details = details;
  }
}

/** 401 bo'lganda chaqiriladi (auth provayderi o'rnatadi → logout). */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) { onUnauthorized = fn; }

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  /** Katta yuklama (katalog, sinxron) — o'z timeout'i bilan; bunday GET kechikish o'lchoviga qo'shilmaydi */
  timeoutMs?: number;
  /** Oflayn holatda ham tarmoqqa chiqadi (profil, foydalanuvchi o'zi tortib yangilaganda) */
  force?: boolean;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const method = opts.method || 'GET';
  const isGet = method === 'GET';
  // Oflaynda GET tarmoqni kutmaydi — darhol xato, ekran keshdagi ma'lumotni ko'rsatadi (polling ham bekor kutmaydi).
  // force (foydalanuvchi tortib yangiladi) — tarmoqqa chiqadi, natijasi holat mashinasiga tekshiruv bo'ladi.
  // POST'lar yuboriladi: oflayn POS navbati va idempotent amallar o'z yo'lini o'zi hal qiladi.
  if (isGet && !opts.force && getNetState() === 'offline') {
    throw new ApiError(getDict().api.offline, 0, undefined, undefined, 'network');
  }

  // Accept-Language — server xato matnlarini ilova tilida qaytaradi (restoran API: lib/restaurant/session.ts mobileLocale)
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Language': getLocale() };
  const useAuth = opts.auth !== false;
  if (useAuth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  // Kichik GET — standart timeout'li o'qish; davomiyligi (sarlavhalar kelguncha) tarmoq holatiga namuna
  const small = isGet && opts.timeoutMs === undefined;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    const aborted = (e as { name?: string })?.name === 'AbortError';
    if (aborted) {
      netReport({ type: 'timeout', small }, t0);
      // POST'da vaqt tugashi «yuborilmadi» emas — server amalni bajargan bo'lishi mumkin
      throw new ApiError(isGet ? getDict().api.timeout : getDict().api.unknownResult, 0, undefined, undefined, 'timeout');
    }
    netReport({ type: 'fail' }, t0);
    throw new ApiError(getDict().api.offline, 0, undefined, undefined, 'network');
  } finally {
    clearTimeout(timer);
  }
  netReport(small ? { type: 'sample', ms: Date.now() - t0 } : { type: 'reach' }, t0);

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && useAuth) {
      await clearToken();
      onUnauthorized?.();
    }
    const err = data as { error?: string; code?: unknown; details?: unknown };
    throw new ApiError(
      err.error || tr(getDict().api.httpError, { status: res.status }),
      res.status,
      typeof err.code === 'string' ? err.code : undefined,
      err.details && typeof err.details === 'object' ? (err.details as Record<string, unknown>) : undefined,
    );
  }
  return data as T;
}

/** Xatodan foydalanuvchiga ko'rsatiladigan matn. */
export function errMsg(e: unknown, fallback?: string): string {
  return e instanceof Error && e.message ? e.message : (fallback ?? getDict().common.errorGeneric);
}
