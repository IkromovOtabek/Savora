'use client';

import { useDict } from '@/lib/i18n/client';

/** Miqdor: − son + (katta bosish maydonlari, 40px). `min` dan pastga bosilsa — onBelowMin (savatdan olib tashlash) */
export default function Stepper({
  value,
  min,
  max,
  onChange,
  onBelowMin,
  labelledBy,
  small = false,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  onBelowMin?: () => void;
  labelledBy?: string;
  small?: boolean;
}) {
  const q = useDict().restaurant.qrMenu;
  const canDec = value > min || !!onBelowMin;
  return (
    <div className={`qm-stepper${small ? ' qm-stepper--sm' : ''}`} role="group" aria-labelledby={labelledBy}>
      <button
        type="button"
        className="qm-step"
        onClick={() => (value > min ? onChange(value - 1) : onBelowMin?.())}
        disabled={!canDec}
        aria-label={q.decrease}
      >
        −
      </button>
      <output className="qm-step-val" aria-live="polite">{value}</output>
      <button type="button" className="qm-step" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={q.increase}>
        +
      </button>
    </div>
  );
}
