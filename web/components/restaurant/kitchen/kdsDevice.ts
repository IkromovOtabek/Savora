'use client';

/**
 * Oshxona ekrani — qurilma imkoniyatlari: ovozli signal (WebAudio), ekran o'chmasligi (Wake Lock),
 * to'liq ekran (Fullscreen API) va localStorage (try/catch — yashirin rejim/bloklangan saqlash).
 * Har biri mavjud bo'lmasa jim ishlamay qoladi — sahifa ularsiz ham to'liq ishlaydi.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { SIGNALS, useAudioSignal } from '@/lib/useAudioSignal';

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

/**
 * Qisqa ikki tonli signal (umumiy WebAudio mantiqi — lib/useAudioSignal.ts, bildirishnomalar bilan bir xil).
 * Brauzer avtoplay cheklovi: birinchi teginishda ochiladi; ungacha `locked` = true («bir marta teging» eslatmasi).
 */
export function useKdsSound(enabled: boolean) {
  const { beep: play, unlock: open, locked } = useAudioSignal(enabled);
  /** Kontekstni ochish (teginishda); `test` — tasdiq tovushi */
  const unlock = useCallback((test = false) => open(test ? SIGNALS.kds : undefined), [open]);
  /** Yangi buyurtma signali (ovoz o'chiq yoki kontekst yopiq bo'lsa — jim) */
  const beep = useCallback(() => play(SIGNALS.kds), [play]);
  return { beep, unlock, locked };
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
