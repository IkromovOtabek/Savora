'use client';

import { useRef, type KeyboardEvent } from 'react';
import './segment-switch.css';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: readonly SegmentOption<T>[];
  /** Tanlangan qiymat; null — hech biri tanlanmagan (masalan, to'lov formasida qo'lda 3 oy kiritilgan) */
  value: T | null;
  onChange: (value: T) => void;
  /** Guruh nomi — ekran o'quvchi uchun (aria-label) */
  label: string;
  disabled?: boolean;
  /** Qo'shimcha klass: `seg-sw--sm` (ixcham) yoki sahifaga xos joylashuv */
  className?: string;
}

/**
 * Segment tugma — WAI-ARIA radiogroup: Tab bilan guruhga kiriladi (tanlangan tugmaga),
 * ←/→ (↑/↓) va Home/End tanlovni almashtiradi. Qiymat formaga o'zi yuborilmaydi —
 * kerak bo'lsa chaqiruvchi yashirin maydon qo'yadi.
 */
export default function SegmentSwitch<T extends string>({ options, value, onChange, label, disabled, className }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = options.findIndex((o) => o.value === value);
  // Roving tabindex: Tab faqat bitta tugmaga tushadi — tanlanganiga (yo'q bo'lsa birinchisiga)
  const tabStop = current >= 0 ? current : 0;

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const last = options.length - 1;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = i === last ? 0 : i + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = i === 0 ? last : i - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next < 0) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(options[next].value);
  }

  return (
    <div role="radiogroup" aria-label={label} className={className ? `seg-sw ${className}` : 'seg-sw'}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          role="radio"
          aria-checked={i === current}
          tabIndex={i === tabStop ? 0 : -1}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
