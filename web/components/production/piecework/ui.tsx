'use client';

import { useEffect, useId, useRef, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons/Icon';
import { toast } from '@/lib/toast';
import { useDict } from '@/lib/i18n/client';
import type { ActionResult } from '@/lib/production/session';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Ishbay oynalari (u-modal uslubi): Esc va fon bosilganda yopiladi (amal ketayotganda — yo'q), fokus oyna ichida
 * aylanadi, ochilganda birinchi maydonga (yoki `data-autofocus`), yopilganda oldingi elementga qaytadi.
 */
export function PwModal({ title, onClose, children, footer, busy = false, wide = false }: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  wide?: boolean;
}) {
  const d = useDict();
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  }, [onClose, busy]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = box.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(`.pw-modal-body :is(${FOCUSABLE})`);
    (first ?? el)?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!busyRef.current) closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !box.current) return;
      const list = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!list.length) return;
      const a = list[0];
      const z = list[list.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (prev && document.contains(prev)) prev.focus();
    };
  }, []);

  return (
    <div className="u-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} className={`u-modal pw-modal${wide ? ' u-modal--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
        <div className="u-modal-head">
          <h3 id={id}>{title}</h3>
          <button type="button" className="u-icon-btn" onClick={onClose} disabled={busy} aria-label={d.common.close}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="pw-modal-body">{children}</div>
        {footer && <div className="pw-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

interface RunOpts<T> {
  ok?: string | ((data: T) => string | undefined);
  after?: (data: T) => void;
  /** Xatoda (masalan oynani ochiq qoldirish) */
  onError?: (error: string, code?: string) => void;
}

/**
 * Ishbay server action'ini bajarish: natija → xabarnoma; muvaffaqiyatda `router.refresh()`
 * (action'lar /app/piecework ni revalidate qiladi, refresh esa joriy filtr bilan qayta chizadi).
 */
export function useRunAction() {
  const d = useDict();
  const router = useRouter();
  const [pending, start] = useTransition();

  function run<T>(fn: () => Promise<ActionResult<T>>, opts: RunOpts<T> = {}) {
    start(async () => {
      let res: ActionResult<T>;
      try {
        res = await fn();
      } catch {
        toast(d.common.errorGeneric, 'error');
        opts.onError?.(d.common.errorGeneric);
        return;
      }
      if (!res.ok) {
        toast(res.error, 'error');
        opts.onError?.(res.error, res.code);
        return;
      }
      const msg = typeof opts.ok === 'function' ? opts.ok(res.data) : opts.ok ?? res.success;
      if (msg) toast(msg, 'success');
      opts.after?.(res.data);
      router.refresh();
    });
  }

  return { pending, run };
}

/** Takroriy bosishdan himoya kaliti (server `clientId`: 8–64, [A-Za-z0-9:_-]) */
export function newClientId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const rnd = () => Math.random().toString(16).slice(2, 10).padEnd(8, '0');
  return `${Date.now().toString(16)}-${rnd()}-${rnd()}-${rnd()}`;
}

/** Holat yorlig'i (rang — holat bo'yicha) */
export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`badge-status pw-st pw-st--${status}`}>{label}</span>;
}
