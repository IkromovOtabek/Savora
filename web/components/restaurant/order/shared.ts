'use client';

/**
 * Stollar va buyurtma ekranlari uchun umumiy yordamchilar (client):
 *  - getJson — web JSON API (polling) uchun GET, xato shakli `{ error, code }` (docs/RESTORAN_API.md §7);
 *  - usePolling — oldingi so'rov tugagach `ms` dan keyin; sahifa yashirin bo'lsa to'xtaydi, ko'ringanda darhol;
 *  - newClientId — idempotentlik kaliti (clientItemId, clientOrderId, payId). crypto.randomUUID http (LAN IP)
 *    sahifada yo'q, shuning uchun getRandomValues;
 *  - vaqt: soat:daqiqa, o'tgan daqiqalar.
 */
import { useEffect, useRef, useState } from 'react';

export type GetResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; code?: string };

export async function getJson<T>(url: string, signal?: AbortSignal): Promise<GetResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', signal, headers: { accept: 'application/json' } });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    return { ok: false, status: 0, error: '' };
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (!res.ok || !body) return { ok: false, status: res.status, error: body?.error ?? '', code: body?.code };
  return { ok: true, data: body };
}

/** Polling: birinchi so'rov `ms` dan keyin (dastlabki ma'lumot serverdan keladi), keyin har safar oldingisi tugagach */
export function usePolling(run: (signal: AbortSignal) => Promise<unknown>, ms: number, enabled = true): void {
  const ref = useRef(run);
  useEffect(() => {
    ref.current = run;
  }, [run]);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ctrl: AbortController | null = null;
    const schedule = (delay: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, delay);
    };
    async function tick() {
      timer = null;
      if (stopped || busy || document.hidden) return;
      busy = true;
      ctrl = new AbortController();
      try {
        await ref.current(ctrl.signal);
      } catch {
        /* bekor qilindi yoki tarmoq — keyingi aylanishda qayta */
      }
      busy = false;
      if (!stopped && !document.hidden) schedule(ms);
    }
    const onVisible = () => {
      if (!document.hidden && !busy) schedule(0);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    schedule(ms);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      ctrl?.abort();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [ms, enabled]);
}

/**
 * Joriy vaqt (ms) — har `ms` da yangilanadi. Boshlang'ich qiymat serverdan (hydration bir xil bo'lsin),
 * `skew` — server soati bilan farq (polling javobidagi serverTime).
 */
export function useNow(initial: number, skew = 0, ms = 15_000): number {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now + skew;
}

/** Idempotentlik kaliti: `<prefix>-<24 hex>` ([A-Za-z0-9:_-], 8–64 belgi) */
export function newClientId(prefix: string): string {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return `${prefix}-${Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** «14:05» (mahalliy vaqt) */
export function hhmm(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `iso` dan `now` gacha o'tgan butun daqiqalar (manfiy — 0) */
export function minutesSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 60_000));
}

/** Davomiylik (ms) → daqiqa (yaxlitlangan, kamida 0) */
export function msToMin(ms: number | null | undefined): number | null {
  return ms === null || ms === undefined ? null : Math.max(0, Math.round(ms / 60_000));
}

/** Matn maydonida yozilayotgan bo'lsa — klaviatura yorliqlari ishlamaydi */
export function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}
