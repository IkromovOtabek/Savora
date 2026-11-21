import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { api, errMsg } from './api';

/**
 * Telegram orqali ro'yxatdan o'tish (server: web/lib/tgSignup.ts, /api/mobile/auth/tg).
 * start → bot havolasi ochiladi (t.me/<bot>?start=su_…) → foydalanuvchi botda raqamini yuboradi →
 * ilova status'ni so'rab turadi (2 s, ilovaga qaytganda darhol) → tasdiq chiptasi `onDone` ga.
 * Native modul kerak emas — faqat Linking.
 */
export interface TgVerified { ticket: string; name: string; phone: string }
type Status = { status: 'pending' } | ({ status: 'done' } & TgVerified) | { status: 'expired' };
export type TgState = 'idle' | 'starting' | 'waiting' | 'expired';

const POLL_MS = 2000;

export function useTgSignup(onDone: (r: TgVerified) => void) {
  const [state, setState] = useState<TgState>('idle');
  const [error, setError] = useState<string | null>(null);
  const session = useRef<{ nonce: string; url: string; until: number } | null>(null);
  const busy = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;

  const poll = useCallback(async () => {
    const s = session.current;
    if (!s || busy.current) return;
    if (Date.now() > s.until) { session.current = null; setState('expired'); return; }
    busy.current = true;
    try {
      const r = await api<Status>(`/api/mobile/auth/tg?nonce=${encodeURIComponent(s.nonce)}`, { token: null, force: true, timeoutMs: 8000 });
      if (session.current !== s) return;
      if (r.status === 'done') {
        session.current = null;
        setState('idle');
        done.current({ ticket: r.ticket, name: r.name, phone: r.phone });
      } else if (r.status === 'expired') {
        session.current = null;
        setState('expired');
      }
    } catch {
      // Tarmoq uzilishi — keyingi urinishda davom etadi
    } finally {
      busy.current = false;
    }
  }, []);

  // Kutish davomida — davriy so'rov va ilovaga qaytganda (Telegram'dan) darhol tekshiruv
  useEffect(() => {
    if (state !== 'waiting') return;
    const t = setInterval(() => { void poll(); }, POLL_MS);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') void poll(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [state, poll]);

  const open = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      return false;
    }
  }, []);

  /** Yangi so'rov va bot havolasini ochish. Ochilmasa — `noApp` matni xato sifatida qaytadi. */
  const start = useCallback(async (noApp: string) => {
    setError(null);
    setState('starting');
    try {
      const r = await api<{ nonce: string; url: string; expiresAt: string }>('/api/mobile/auth/tg', { method: 'POST', token: null });
      session.current = { nonce: r.nonce, url: r.url, until: new Date(r.expiresAt).getTime() };
      setState('waiting');
      if (!(await open(r.url))) setError(noApp);
    } catch (e) {
      session.current = null;
      setState('idle');
      setError(errMsg(e));
    }
  }, [open]);

  /** Telegram'ni qayta ochish (foydalanuvchi botni yopib qo'ygan bo'lsa) */
  const reopen = useCallback(async (noApp: string) => {
    const s = session.current;
    if (s && !(await open(s.url))) setError(noApp);
  }, [open]);

  const cancel = useCallback(() => {
    session.current = null;
    setError(null);
    setState('idle');
  }, []);

  return { state, error, start, reopen, cancel };
}
