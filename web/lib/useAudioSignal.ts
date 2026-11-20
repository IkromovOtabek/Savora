'use client';

/**
 * Qisqa ovozli signal (WebAudio, fayl yuklamasdan) — oshxona ekrani (KDS) va bildirishnomalar qo'ng'iroqchasi uchun
 * umumiy. Brauzer avtoplay cheklovi: AudioContext faqat foydalanuvchi teginishidan keyin ishlaydi — birinchi teginishda
 * (pointerdown/keydown) ochiladi; ungacha `locked` = true (ekranda «bir marta teging» eslatmasi).
 * WebAudio bo'lmasa — jim ishlamay qoladi.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Bitta ohang: chastota (Hz), boshlanish va davomiylik (soniya) */
export interface SignalTone { freq: number; at: number; dur: number }
export type SignalPattern = readonly SignalTone[];

/** Tayyor ohanglar: KDS — yangi buyurtma; call — mijoz chaqiruvi (ko'tariluvchi, shoshilinch); stock — ombor (pasayuvchi, yumshoq) */
export const SIGNALS = {
  kds: [{ freq: 880, at: 0, dur: 0.18 }, { freq: 1320, at: 0.2, dur: 0.28 }],
  call: [{ freq: 988, at: 0, dur: 0.14 }, { freq: 1319, at: 0.16, dur: 0.14 }, { freq: 1568, at: 0.32, dur: 0.3 }],
  stock: [{ freq: 784, at: 0, dur: 0.2 }, { freq: 587, at: 0.24, dur: 0.32 }],
  info: [{ freq: 880, at: 0, dur: 0.22 }],
} as const satisfies Record<string, SignalPattern>;

type AudioCtor = typeof AudioContext;

function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  if (typeof AudioContext !== 'undefined') return AudioContext;
  return (window as Window & { webkitAudioContext?: AudioCtor }).webkitAudioContext ?? null;
}

function playPattern(c: AudioContext, pattern: SignalPattern) {
  const t0 = c.currentTime + 0.01;
  for (const { freq, at, dur } of pattern) {
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
  }
}

export function useAudioSignal(enabled: boolean) {
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

  /** Kontekstni ochish (teginishda); `test` berilsa — shu tasdiq tovushi. Ochilmasa 400 ms dan keyin `locked` */
  const unlock = useCallback((test?: SignalPattern) => {
    const c = ensure();
    if (!c) return;
    if (c.state === 'running') {
      setLocked(false);
      if (test) playPattern(c, test);
      return;
    }
    c.resume()
      .then(() => {
        setLocked(c.state !== 'running');
        if (test && c.state === 'running') playPattern(c, test);
      })
      .catch(() => setLocked(true));
    window.setTimeout(() => { if (c.state !== 'running') setLocked(true); }, 400);
  }, [ensure]);

  useEffect(() => {
    if (!enabled) return;
    if (!audioCtor()) return;
    // Sahifaga menyudan (bosish bilan) kelingan bo'lsa — faollashtirish bor, kontekst darhol ochiladi
    const activated = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive;
    if (activated || ctxRef.current) unlock();
    else setLocked(true);
    const onGesture = () => unlock();
    window.addEventListener('pointerdown', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
    return () => {
      window.removeEventListener('pointerdown', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
    };
  }, [enabled, unlock]);

  /** Signal (ovoz o'chiq yoki kontekst yopiq bo'lsa — jim) */
  const beep = useCallback((pattern: SignalPattern) => {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    if (c.state === 'running') {
      playPattern(c, pattern);
      return;
    }
    // Avval teginish bo'lgan bo'lsa ochiladi; bo'lmasa kechikkan tovush chalinmasin (1,5 s chegarasi)
    const asked = Date.now();
    c.resume()
      .then(() => {
        if (c.state === 'running' && Date.now() - asked < 1500) playPattern(c, pattern);
        setLocked(c.state !== 'running');
      })
      .catch(() => setLocked(true));
    window.setTimeout(() => { if (c.state !== 'running') setLocked(true); }, 400);
  }, [enabled, ensure]);

  useEffect(() => () => {
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  return { beep, unlock, locked: enabled && locked };
}
