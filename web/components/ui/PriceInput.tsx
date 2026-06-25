'use client';

import { useState } from 'react';

/** Raqamni minglik bo'shliq bilan formatlaydi: 100000 → "100 000" */
export function formatPrice(raw: string | number): string {
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

interface Props {
  name?: string;
  id?: string;
  defaultValue?: number | string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Controlled rejim: value — toza raqam (bo'shliqsiz), onValueChange — toza raqam qaytaradi */
  value?: string;
  onValueChange?: (raw: string) => void;
}

/**
 * Narx kiritish — "1 000", "10 000", "100 000" ko'rinishida.
 * Forma bo'sh joy bilan yuboradi; backend parsePrice/parseAmount bo'shliqlarni tozalaydi.
 */
export default function PriceInput({
  name,
  id,
  defaultValue,
  required,
  disabled,
  placeholder,
  className,
  value,
  onValueChange,
}: Props) {
  const controlled = value !== undefined && onValueChange !== undefined;
  const [inner, setInner] = useState(() =>
    defaultValue !== undefined && defaultValue !== '' ? formatPrice(String(defaultValue)) : ''
  );

  const display = controlled ? formatPrice(value as string) : inner;

  return (
    <input
      id={id}
      name={name}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={display}
      onChange={(e) => {
        const raw = e.target.value.replace(/\D/g, '');
        if (controlled) onValueChange!(raw);
        else setInner(formatPrice(e.target.value));
      }}
      required={required}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
    />
  );
}
