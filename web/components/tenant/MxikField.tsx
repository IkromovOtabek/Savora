'use client';

import { useId, useRef, useState } from 'react';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { MXIK_SITE_URL, formatMxik, normalizeMxik, parseMxikInput, type MxikItem } from '@/lib/mxik';
import './styles/mxik.css';

/**
 * Mahsulot formasidagi MXIK (IKPU) maydoni: qo'lda kiritish (17 raqam) yoki katalogdan qidirish
 * (/api/mxik/search — server proksi, tasnif.soliq.uz). Katalog ishlamasa ham forma ishlaydi: xato + rasmiy saytga havola.
 * Katalogda kod markirovkali bo'lsa (label = 1) — `onMarkedHint` chaqiriladi (forma «Markirovkali tovar»ni yoqadi).
 */
export default function MxikField({
  initial,
  disabled,
  queryHint,
  onMarkedHint,
}: {
  initial?: string;
  disabled?: boolean;
  /** Qidiruv oynasi ochilganda boshlang'ich so'rov (mahsulot nomi yoki shtrix-kod) */
  queryHint?: () => string;
  onMarkedHint?: () => void;
}) {
  const t = useDict().stock.mxik;
  const id = useId();
  const [value, setValue] = useState(initial ?? '');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<MxikItem[] | null>(null);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState<string | null>(null);
  const seq = useRef(0);

  const parsed = parseMxikInput(value);
  const bad = parsed === null;

  async function search(query: string) {
    const s = query.trim();
    if (s.length < 2) { setError(t.badQuery); setItems(null); return; }
    const my = ++seq.current;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/mxik/search?q=${encodeURIComponent(s)}`, { headers: { accept: 'application/json' } });
      const body = (await res.json().catch(() => ({}))) as { items?: MxikItem[]; error?: string };
      if (my !== seq.current) return;
      if (!res.ok || !Array.isArray(body.items)) { setItems(null); setError(body.error || t.unavailable); return; }
      setItems(body.items);
    } catch {
      if (my === seq.current) { setItems(null); setError(t.unavailable); }
    } finally {
      if (my === seq.current) setBusy(false);
    }
  }

  function openSearch() {
    const start = (queryHint?.() ?? '').trim();
    setOpen(true);
    setApplied(null);
    setQ(start);
    if (start.length >= 2) void search(start);
  }

  function pick(item: MxikItem) {
    setValue(item.code);
    setOpen(false);
    if (item.marked && onMarkedHint) { onMarkedHint(); setApplied(t.markedApplied); }
  }

  return (
    <div className="auth-field mx-field">
      <label htmlFor={`${id}-ikpu`}>{t.label}</label>
      <div className="mx-row">
        <input
          id={`${id}-ikpu`}
          name="ikpu"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          maxLength={24}
          className="st-mono"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d\s]/g, ''))}
          placeholder="00901001001048019"
          aria-invalid={bad || undefined}
          aria-describedby={`${id}-ikpu-h`}
          disabled={disabled}
        />
        <button type="button" className="btn btn-tinted btn-sm btn-with-icon" onClick={() => (open ? setOpen(false) : openSearch())} disabled={disabled} aria-expanded={open} aria-controls={`${id}-mx-pop`}>
          <Icon name="search" size={15} /> {t.search}
        </button>
      </div>
      <span id={`${id}-ikpu-h`} className={bad ? 'field-hint mx-bad' : 'field-hint'} role={bad ? 'alert' : undefined}>
        {bad ? t.invalid : parsed ? formatMxik(parsed) : t.hint}{' '}
        <a href={MXIK_SITE_URL} target="_blank" rel="noopener noreferrer" title={t.siteTitle}>{t.site} ↗</a>
      </span>
      {applied && <span className="st-bc-hint" role="status"><Icon name="sparkles" size={15} /> {applied}</span>}

      {open && (
        <div className="mx-pop" id={`${id}-mx-pop`} role="region" aria-label={t.search}>
          <div className="mx-search" role="search">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void search(q); } if (e.key === 'Escape') setOpen(false); }}
              placeholder={t.searchPh}
              aria-label={t.searchPh}
              autoFocus
              maxLength={80}
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void search(q)} disabled={busy}>{busy ? t.searching : t.searchBtn}</button>
            <button type="button" className="btn btn-plain btn-sm" onClick={() => setOpen(false)} aria-label={t.close}><Icon name="close" size={16} /></button>
          </div>
          {error ? (
            <p className="mx-msg mx-bad" role="alert">
              {error} <a href={MXIK_SITE_URL} target="_blank" rel="noopener noreferrer">{t.site} ↗</a>
            </p>
          ) : items && items.length === 0 ? (
            <p className="mx-msg">{t.none}</p>
          ) : items ? (
            <ul className="mx-list" aria-busy={busy || undefined}>
              {items.map((it) => (
                <li key={it.code}>
                  <button type="button" className="mx-item" onClick={() => pick(it)} aria-current={normalizeMxik(value) === it.code || undefined}>
                    <span className="mx-item-name">{it.name}</span>
                    <span className="mx-item-meta">
                      <code className="st-mono">{formatMxik(it.code)}</code>
                      {it.unit && <span>{it.unit}</span>}
                      {it.marked && <span className="mx-tag">{t.markedTag}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mx-src">{t.source}</p>
        </div>
      )}
    </div>
  );
}
