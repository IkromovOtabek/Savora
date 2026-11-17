'use client';

import { useId, useRef, useState } from 'react';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';

interface Props {
  label: string;
  hint: string;
  value: string;
  onChange: (url: string) => void;
  /** Ko'rinish: logo — kvadrat, muqova — keng */
  shape: 'square' | 'wide';
  disabled?: boolean;
}

/** Brend rasmi (logo / muqova): /api/upload ga yuklaydi, URL'ni ota formaga qaytaradi */
export default function BrandImageField({ label, hint, value, onChange, shape, disabled }: Props) {
  const d = useDict();
  const t = d.restaurant.settings;
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function upload(file: File) {
    setError('');
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || t.uploadFailed);
      onChange(data.url);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t.uploadFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rs-img rs-img--${shape}`}>
      <span className="rs-label" id={`${id}-l`}>{label}</span>
      <div className="rs-img-row">
        <div className="rs-img-box" aria-hidden={!value}>
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={label} />
          ) : (
            <Icon name={shape === 'square' ? 'store' : 'box'} size={22} />
          )}
        </div>
        <div className="rs-img-actions">
          <button
            type="button"
            className="btn btn-sm btn-tinted"
            disabled={disabled || busy}
            aria-describedby={`${id}-h`}
            aria-labelledby={`${id}-l ${id}-b`}
            id={`${id}-b`}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? d.common.loading : value ? t.replace : t.upload}
          </button>
          {value && (
            <button type="button" className="btn btn-sm btn-ghost" disabled={disabled || busy} onClick={() => onChange('')}>
              {t.remove}
            </button>
          )}
        </div>
      </div>
      <small className="rs-hint" id={`${id}-h`}>{hint}</small>
      {error && <small className="rs-error" role="alert">{error}</small>}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
