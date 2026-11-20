'use client';

/**
 * Sarlavhadagi qo'ng'iroqcha (app/app/layout.tsx): o'qilmaganlar soni, ochiladigan ro'yxat (yangisi tepada),
 * «Hammasini o'qildi», bosilganda — o'qildi + tegishli sahifa. API — /api/notifications (lib/notify.ts).
 *
 * So'rov: sahifa ko'rinib turganda har 15 s (yashirin bo'lsa to'xtaydi; qaytganda/fokusda — darhol). Birinchi so'rov —
 * ro'yxat, keyingilari — `after` bilan faqat yangilari.
 * Ovoz: faqat sahifa ochilgandan KEYIN kelgan o'qilmagan xabarga (chaqiruv — shoshilinch ohang, ombor — yumshoq);
 * «Ovoz» tugmasi shu qurilmada saqlanadi (localStorage, standart yoqiq); avtoplay cheklovi — birinchi teginishda ochiladi.
 * Mijoz chaqiruvi (shoshilinch) — ekranda alohida toast (20 s yoki yopilguncha).
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Icon, { type IconName } from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { SIGNALS, useAudioSignal } from '@/lib/useAudioSignal';
import { notifyAgo, notifyTone, type NotificationList, type NotificationView, type NotifyTone } from '@/lib/notifyView';
import './notify.css';

const POLL_MS = 15_000;
const TOAST_MS = 20_000;
const SOUND_KEY = 'savora_notify_sound';
const API = '/api/notifications';

const ICONS: Record<string, IconName> = {
  waiterCall: 'users',
  billCall: 'wallet',
  lowStock: 'box',
  dishLow: 'utensils',
  reservationSoon: 'clock',
};

function readSound(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== '0';
  } catch {
    return true;
  }
}

function writeSound(on: boolean) {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? '1' : '0');
  } catch {
    /* saqlash bloklangan — tanlov faqat shu seansda */
  }
}

/** Yangi kelganlar orasidagi eng muhim ohang (chaqiruv > ombor > boshqa) */
export function strongestTone(items: readonly Pick<NotificationView, 'kind'>[]): NotifyTone | null {
  const tones = items.map((i) => notifyTone(i.kind));
  if (tones.includes('call')) return 'call';
  if (tones.includes('stock')) return 'stock';
  return tones.length ? 'info' : null;
}

/** Ro'yxatni birlashtirish: id bo'yicha yangisi ustun, yangisi tepada, ko'pi bilan 50 ta */
export function mergeItems(prev: readonly NotificationView[], next: readonly NotificationView[]): NotificationView[] {
  const byId = new Map(prev.map((i) => [i.id, i]));
  for (const i of next) byId.set(i.id, i);
  return [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)).slice(0, 50);
}

export default function NotifyBell() {
  const d = useDict();
  const t = d.notify.bell;
  const router = useRouter();
  const [items, setItems] = useState<NotificationView[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [toasts, setToasts] = useState<NotificationView[]>([]);
  const [sound, setSound] = useState(true);
  const [skew, setSkew] = useState(0);
  const { beep, unlock, locked } = useAudioSignal(sound);
  // So'rov funksiyasi barqaror qolsin (ovoz yoqilib-o'chirilganda polling qayta boshlanmasin)
  const beepRef = useRef(beep);
  useEffect(() => { beepRef.current = beep; }, [beep]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const cursor = useRef<string | null>(null);
  const known = useRef<Set<string>>(new Set());
  const inflight = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => { setSound(readSound()); }, []);

  const dismissToast = useCallback((id: string) => setToasts((v) => v.filter((x) => x.id !== id)), []);

  /** full — butun ro'yxat (birinchi marta va ro'yxat ochilganda), aks holda faqat yangilari */
  const load = useCallback(async (full: boolean) => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const first = cursor.current === null;
      const qs = full || first ? 'limit=30' : `after=${encodeURIComponent(cursor.current!)}&limit=50`;
      const res = await fetch(`${API}?${qs}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as NotificationList;
      setSkew(Date.parse(data.serverTime) - Date.now());
      setUnread(data.unread);
      setError(false);
      setLoaded(true);
      // Sahifa ochilgandan keyin kelgan, hali o'qilmagan yangilar — ovoz va (chaqiruvda) toast
      const fresh = first ? [] : data.items.filter((i) => !known.current.has(i.id) && !i.read);
      for (const i of data.items) known.current.add(i.id);
      const newest = data.items[0]?.createdAt;
      if (newest && (!cursor.current || newest > cursor.current)) cursor.current = newest;
      else if (!cursor.current) cursor.current = data.serverTime;
      setItems((prev) => (full ? mergeItems([], data.items) : mergeItems(prev, data.items)));
      if (fresh.length) {
        const tone = strongestTone(fresh);
        if (tone) beepRef.current(SIGNALS[tone]);
        const urgent = fresh.filter((i) => notifyTone(i.kind) === 'call');
        if (urgent.length) {
          setToasts((v) => [...urgent, ...v].slice(0, 3));
          for (const u of urgent) window.setTimeout(() => dismissToast(u.id), TOAST_MS);
        }
      }
    } catch {
      setError(true);
    } finally {
      inflight.current = false;
    }
  }, [dismissToast]);

  // So'rov: ko'rinib turganda har 15 s; yashirinsa to'xtaydi; qaytganda va oynaga fokusda — darhol
  useEffect(() => {
    let timer: number | null = null;
    const stop = () => { if (timer !== null) { window.clearInterval(timer); timer = null; } };
    const start = () => { if (timer === null) timer = window.setInterval(() => void load(false), POLL_MS); };
    const onVisible = () => {
      if (document.visibilityState === 'visible') { void load(false); start(); } else stop();
    };
    const onFocus = () => { if (document.visibilityState === 'visible') void load(false); };
    void load(true);
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  // Ro'yxat: tashqariga bosish va Escape yopadi
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  async function post(body: { id: string } | { all: true }) {
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number };
      setUnread(data.unread);
    } catch {
      /* keyingi so'rovda tiklanadi */
    }
  }

  function markLocal(id: string | null) {
    setItems((v) => v.map((i) => (id === null || i.id === id ? { ...i, read: true } : i)));
  }

  function openItem(n: NotificationView) {
    dismissToast(n.id);
    setOpen(false);
    if (!n.read) {
      markLocal(n.id);
      setUnread((u) => Math.max(0, u - 1));
      void post({ id: n.id });
    }
    if (n.url) router.push(n.url);
  }

  function markAll() {
    markLocal(null);
    setUnread(0);
    void post({ all: true });
  }

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) void load(true);
  }

  function toggleSound() {
    const next = !sound;
    setSound(next);
    writeSound(next);
    if (next) unlock(SIGNALS.info); // teginish ichida — avtoplay cheklovi yo'q, tasdiq tovushi
  }

  const now = Date.now() + skew;
  const label = unread > 0 ? tr(t.labelUnread, { n: unread }) : t.label;

  return (
    <div className="nb" ref={box}>
      <button
        ref={btn}
        type="button"
        className="t-icon-btn nb-btn"
        aria-label={label}
        title={t.label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggleOpen}
      >
        <Icon name="bell" size={18} />
        {unread > 0 && <span className="nb-badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="nb-panel" id={panelId} role="dialog" aria-label={t.title}>
          <div className="nb-head">
            <b className="nb-title">{t.title}</b>
            <button
              type="button"
              className={`nb-sound${sound ? ' nb-sound--on' : ''}`}
              onClick={toggleSound}
              aria-pressed={sound}
              title={t.soundHint}
            >
              <span className="nb-sound-dot" aria-hidden="true" />
              {sound ? t.soundOn : t.soundOff}
            </button>
          </div>
          {sound && locked && (
            <button type="button" className="nb-locked" onClick={() => unlock(SIGNALS.info)}>{t.soundLocked}</button>
          )}

          <div className="nb-list" role="list">
            {!loaded && !error ? (
              <p className="nb-empty" aria-busy="true">…</p>
            ) : error && items.length === 0 ? (
              <div className="nb-empty">
                <p>{t.loadError}</p>
                <button type="button" className="t-btn t-btn--gray" onClick={() => void load(true)}>{t.retry}</button>
              </div>
            ) : items.length === 0 ? (
              <div className="nb-empty">
                <b>{t.empty}</b>
                <p>{t.emptyHint}</p>
              </div>
            ) : (
              items.map((n) => {
                const tone = notifyTone(n.kind);
                return (
                  <div role="listitem" key={n.id}>
                    <button
                      type="button"
                      className={`nb-item nb-item--${tone}${n.read ? '' : ' nb-item--unread'}`}
                      onClick={() => openItem(n)}
                    >
                      <span className="nb-ico" aria-hidden="true"><Icon name={ICONS[n.kind] ?? 'bell'} size={18} /></span>
                      <span className="nb-text">
                        <b>{n.title}</b>
                        {n.body && <span>{n.body}</span>}
                        <small>
                          {notifyAgo(d, n.createdAt, now)}
                          {n.handled ? ` · ${t.handled}` : ''}
                        </small>
                      </span>
                      {!n.read && <span className="nb-dot" aria-label={t.unread} />}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {unread > 0 && (
            <div className="nb-foot">
              <button type="button" className="t-btn t-btn--tinted nb-all" onClick={markAll}>
                <Icon name="check" size={16} />
                {t.markAll}
              </button>
            </div>
          )}
        </div>
      )}

      {mounted && toasts.length > 0 && createPortal(
        <div className="nb-toasts" role="alert" aria-live="assertive">
          {toasts.map((n) => (
            <div key={n.id} className="nb-toast">
              <span className="nb-ico nb-ico--call" aria-hidden="true"><Icon name={ICONS[n.kind] ?? 'bell'} size={20} /></span>
              <span className="nb-text">
                <b>{n.title}</b>
                {n.body && <span>{n.body}</span>}
              </span>
              <button type="button" className="t-btn t-btn--filled nb-toast-open" onClick={() => openItem(n)}>{t.open}</button>
              <button type="button" className="nb-toast-x" onClick={() => dismissToast(n.id)} aria-label={t.close}>
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
