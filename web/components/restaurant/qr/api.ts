/**
 * Mijoz QR-menyusi → ochiq API (/api/public/menu/:slug/:token/*). Faqat shu yo'llar; sessiya/cookie
 * talab qilinmaydi. Xato javobi: { error, code } + HTTP holati; 429 — Retry-After sarlavhasi.
 */
import { publicMenuApiPath } from '@/lib/restaurant/qr';
import type { PublicOrderStatus } from '@/lib/restaurant/public';
import type { TableCallKind } from '@/lib/restaurant/types';

export type ApiOk<T> = { ok: true; data: T };
/** `code: 'network'` — javob kelmadi (aloqa yo'q / server o'chiq) */
export type ApiErr = { ok: false; status: number; code: string; error: string; retryAfter: number };
export type ApiResult<T> = ApiOk<T> | ApiErr;

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    let body: unknown = null;
    try { body = await res.json(); } catch { /* bo'sh yoki JSON emas */ }
    if (res.ok) return { ok: true, data: body as T };
    const b = (body ?? {}) as { code?: unknown; error?: unknown };
    const retryAfter = Math.max(1, Math.min(3600, Number(res.headers.get('Retry-After')) || 60));
    return {
      ok: false,
      status: res.status,
      code: typeof b.code === 'string' ? b.code : res.status === 429 ? 'rateLimited' : 'failed',
      error: typeof b.error === 'string' ? b.error : '',
      retryAfter,
    };
  } catch {
    return { ok: false, status: 0, code: 'network', error: '', retryAfter: 0 };
  }
}

export interface PlaceOrderBody {
  clientOrderId: string;
  items: { productId: string; qty: number; optionIds?: string[]; note?: string }[];
}

export function qrApi(slug: string, token: string) {
  const base = publicMenuApiPath(slug, token);
  return {
    orderStatus: () => call<PublicOrderStatus>(`${base}/order`),
    placeOrder: (body: PlaceOrderBody) =>
      call<PublicOrderStatus & { added: number }>(`${base}/order`, { method: 'POST', body: JSON.stringify(body) }),
    callStaff: (kind: TableCallKind) =>
      call<{ kind: TableCallKind; at: string }>(`${base}/call`, { method: 'POST', body: JSON.stringify({ kind }) }),
  };
}
