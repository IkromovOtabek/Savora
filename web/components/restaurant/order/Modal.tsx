'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Restoran oynalari uchun umumiy modal (u-modal uslubi): Esc va fon bosilganda yopiladi (amal ketayotganda — yo'q),
 * fokus oyna ichida aylanadi, ochilganda birinchi maydonga, yopilganda oldingi elementga qaytadi.
 */
export default function Modal({ title, onClose, children, footer, busy = false, wide = false, className = '' }: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Amal ketmoqda — yopish bloklanadi */
  busy?: boolean;
  wide?: boolean;
  className?: string;
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
    const first = el?.querySelector<HTMLElement>('[data-autofocus]')
      ?? el?.querySelector<HTMLElement>(`.rt-modal-body :is(${FOCUSABLE})`);
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
    <div className="u-modal-overlay rt-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div
        ref={box}
        className={`u-modal rt-modal${wide ? ' u-modal--wide' : ''}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
      >
        <div className="u-modal-head">
          <h3 id={id}>{title}</h3>
          <button type="button" className="u-icon-btn" onClick={onClose} disabled={busy} aria-label={d.common.close}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="rt-modal-body">{children}</div>
        {footer && <div className="rt-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Miqdor tanlagich (−/+), katta bosish maydonlari. Kasrli birlik (kg…) — matn kiritish */
export function QtyStepper({ value, onChange, min = 1, max = 1000, label, decLabel, incLabel, fractional = false, text, onText }: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  label: string;
  decLabel: string;
  incLabel: string;
  fractional?: boolean;
  /** Kasrli birlikda kiritilayotgan matn */
  text?: string;
  onText?: (s: string) => void;
}) {
  return (
    <div className="rt-qty" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value - 1 < min} aria-label={decLabel}>−</button>
      {fractional && onText ? (
        <input
          inputMode="decimal"
          value={text ?? String(value).replace('.', ',')}
          onChange={(e) => onText(e.target.value.replace(/[^\d.,]/g, ''))}
          aria-label={label}
        />
      ) : (
        <output aria-live="polite">{String(value).replace('.', ',')}</output>
      )}
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value + 1 > max} aria-label={incLabel}>+</button>
    </div>
  );
}
