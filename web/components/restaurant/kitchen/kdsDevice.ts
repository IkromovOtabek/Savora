'use client';

/**
 * Oshxona ekrani — qurilma imkoniyatlari: ovozli signal (WebAudio), ekran o'chmasligi (Wake Lock),
 * to'liq ekran (Fullscreen API) va localStorage (try/catch — yashirin rejim/bloklangan saqlash).
 * Har biri mavjud bo'lmasa jim ishlamay qoladi — sahifa ularsiz ham to'liq ishlaydi.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/* ───────────────────────────── localStorage ───────────────────────────── */

export function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStore(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* saqlash bloklangan — tanlov faqat shu seansda */
  }
}

/* ───────────────────────────── ovozli signal ───────────────────────────── */

type AudioCtor = typeof AudioContext;

function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  if (typeof AudioContext !== 'undefined') return AudioContext;
  return (window as Window & { webkitAudioContext?: AudioCtor }).webkitAudioContext ?? null;
}

/**
 * Qisqa ikki tonli signal. Brauzer avtoplay cheklovi: AudioContext faqat foydalanuvchi teginishidan
 * keyin ishlaydi — birinchi teginishda (pointerdown/keydown) ochiladi; ungacha `locked` = true
 * (ekranda «bir marta teging» eslatmasi).
 */
export function useKdsSound(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const [locked, setLocked] = useState(false);

  const ensure = useCallback((): AudioContext | null => {
    if (ctxRef.current) return ctxRef.current;
    const AC = audioCtor();
    if (!AC) return null;
    try {
      const c = new AC();
      c.addEventListener('statechange', () => setLocked(c.state !== 'running'));
      ctxRef.current = c;
    } catch {
      return null;
    }
    return ctxRef.current;
  }, []);

  const play = useCallback((c: AudioContext) => {
    const t0 = c.currentTime + 0.01;
    const tone = (freq: number, at: number, dur: number) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.4, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      osc.connect(gain).connect(c.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + dur + 0.05);
    };
    tone(880, 0, 0.18);
    tone(1320, 0.2, 0.28);
  }, []);

  /** Kontekstni ochish (teginishda); `test` — tasdiq tovushi. Ochilmasa 400 ms dan keyin `locked` */
  const unlock = useCallback((test = false) => {
    const c = ensure();
    if (!c) return;
    if (c.state === 'running') {
      setLocked(false);
      if (test) play(c);
      return;
    }
    c.resume()
      .then(() => {
        setLocked(c.state !== 'running');
        if (test && c.state === 'running') play(c);
      })
      .catch(() => setLocked(true));
    window.setTimeout(() => { if (c.state !== 'running') setLocked(true); }, 400);
  }, [ensure, play]);

  useEffect(() => {
    if (!enabled) return;
    if (!audioCtor()) return;
    // Sahifaga menyudan (bosish bilan) kelingan bo'lsa — faollashtirish bor, kontekst darhol ochiladi
    const activated = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive;
    if (activated || ctxRef.current) unlock(false);
    else setLocked(true);
    const onGesture = () => unlock(false);
    window.addEventListener('pointerdown', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
    return () => {
      window.removeEventListener('pointerdown', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
    };
  }, [enabled, unlock]);

  /** Yangi buyurtma signali (ovoz o'chiq yoki kontekst yopiq bo'lsa — jim) */
  const beep = useCallback(() => {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    if (c.state === 'running') {
      play(c);
      return;
    }
    // Avval teginish bo'lgan bo'lsa ochiladi; bo'lmasa kechikkan tovush chalinmasin (1,5 s chegarasi)
    const asked = Date.now();
    c.resume()
      .then(() => {
        if (c.state === 'running' && Date.now() - asked < 1500) play(c);
        setLocked(c.state !== 'running');
      })
      .catch(() => setLocked(true));
    window.setTimeout(() => { if (c.state !== 'running') setLocked(true); }, 400);
  }, [enabled, ensure, play]);

  useEffect(() => () => {
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  return { beep, unlock, locked: enabled && locked };
}

/* ───────────────────────────── ekran o'chmasligi ───────────────────────────── */

interface WakeSentinel { released: boolean; release(): Promise<void>; addEventListener(t: 'release', f: () => void): void }
interface WakeLockApi { request(type: 'screen'): Promise<WakeSentinel> }

/** Screen Wake Lock: sahifa ko'rinib turganda ekran o'chmaydi; yashirinib qaytganda qayta olinadi */
export function useWakeLock(enabled: boolean): { supported: boolean; active: boolean } {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    setSupported(!!api);
    if (!enabled || !api) return;
    let sentinel: WakeSentinel | null = null;
    let cancelled = false;
    let pending = false;

    const acquire = async () => {
      if (cancelled || pending || (sentinel && !sentinel.released) || document.visibilityState !== 'visible') return;
      pending = true;
      try {
        const s = await api.request('screen');
        if (cancelled) {
          s.release().catch(() => {});
          return;
        }
        sentinel = s;
        setActive(true);
        s.addEventListener('release', () => {
          sentinel = null;
          setActive(false);
        });
      } catch {
        setActive(false); // batareya tejash rejimi yoki ruxsat yo'q — keyingi teginishda qayta urinadi
      } finally {
        pending = false;
      }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void acquire(); };
    const onGesture = () => void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pointerdown', onGesture, true);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pointerdown', onGesture, true);
      sentinel?.release().catch(() => {});
      sentinel = null;
      setActive(false);
    };
  }, [enabled]);

  return { supported, active };
}

/* ───────────────────────────── to'liq ekran ───────────────────────────── */

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

const fsElement = () => {
  const d = document as FsDoc;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
};

/**
 * «Kiosk» rejimi: menyu/panelsiz ixcham ekran. Fullscreen API bo'lsa — haqiqiy to'liq ekran
 * (Esc bilan chiqilsa kiosk ham o'chadi); bo'lmasa (masalan iPhone Safari) — faqat CSS rejim.
 */
export function useKiosk() {
  const [kiosk, setKiosk] = useState(false);
  const wasFull = useRef(false);

  useEffect(() => {
    const onChange = () => {
      const full = !!fsElement();
      if (wasFull.current && !full) setKiosk(false);
      wasFull.current = full;
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const toggle = useCallback(() => {
    if (kiosk) {
      setKiosk(false);
      if (fsElement()) {
        const d = document as FsDoc;
        try {
          if (d.exitFullscreen) d.exitFullscreen().catch(() => {});
          else d.webkitExitFullscreen?.();
        } catch { /* e'tiborsiz */ }
      }
      return;
    }
    setKiosk(true);
    const el = document.documentElement as FsEl;
    try {
      if (el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      else el.webkitRequestFullscreen?.();
    } catch { /* qo'llab-quvvatlanmaydi — CSS kiosk qoladi */ }
  }, [kiosk]);

  return { kiosk, toggle };
}
