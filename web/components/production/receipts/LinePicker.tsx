'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import BarcodeInputField from '@/components/ui/BarcodeInputField';
import { useDict } from '@/lib/i18n/client';
import { qtyWithUnit, tr } from '@/lib/i18n/fmt';
import { toast } from '@/lib/toast';
import { toLineProduct, type LineProduct } from './lines';

const MIN_QUERY = 1;
const DEBOUNCE_MS = 250;

/**
 * Hujjat qatoriga tovar qo'shish: nom/kod bo'yicha qidiruv (shu ombordagi tovarlar —
 * GET /api/production/products?branchId=) va shtrix-kod (pistalet skaner, kamera, qo'lda + Enter).
 * Skanerda kod aniq mos kelgan tovar darhol qo'shiladi (`via: 'scan'`), qidiruvdan tanlangani — `via: 'pick'`.
 */
export default function LinePicker({
  branchId,
  onPick,
  disabled,
}: {
  branchId: string;
  onPick: (p: LineProduct, via: 'scan' | 'pick') => void;
  disabled?: boolean;
}) {
  const d = useDict();
  const t = d.production.receipts;
  const units = d.stock.fields.units;
  const listId = useId();
  const [items, setItems] = useState<LineProduct[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  // Tanlangandan keyin maydon tozalanadi (komponent qayta o'rnatiladi) va fokus qaytadi — keyingi skan uchun
  const [resetKey, setResetKey] = useState(0);
  const ctrl = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ombor o'zgarsa — eski natijalar boshqa omborniki
  useEffect(() => {
    setItems([]);
    setOpen(false);
  }, [branchId]);

  useEffect(() => {
    if (resetKey > 0) document.getElementById(`${listId}-q`)?.focus();
  }, [resetKey, listId]);

  useEffect(() => () => {
    ctrl.current?.abort();
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function search(q: string): Promise<LineProduct[] | null> {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    try {
      const sp = new URLSearchParams({ branchId, q, limit: '20' });
      const res = await fetch(`/api/production/products?${sp}`, { signal: c.signal, cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || !Array.isArray(json.items)) {
        toast(json?.error ?? d.production.errors.failed, 'error');
        return null;
      }
      return (json.items as Parameters<typeof toLineProduct>[0][]).map(toLineProduct);
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast(d.production.errors.failed, 'error');
      return null;
    } finally {
      if (ctrl.current === c) setLoading(false);
    }
  }

  function onType(v: string) {
    if (timer.current) clearTimeout(timer.current);
    const q = v.trim();
    if (q.length < MIN_QUERY) {
      ctrl.current?.abort();
      setItems([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      const list = await search(q);
      if (!list) return;
      setItems(list);
      setActive(0);
      setOpen(true);
    }, DEBOUNCE_MS);
  }

  function pick(p: LineProduct, via: 'scan' | 'pick') {
    onPick(p, via);
    setItems([]);
    setOpen(false);
    setResetKey((k) => k + 1);
  }

  /** Enter / pistalet / kamera: aniq kod → qo'shiladi; ochiq ro'yxatda tanlangan → qo'shiladi; aks holda qidiruv */
  async function onScan(raw: string) {
    if (timer.current) clearTimeout(timer.current);
    const code = raw.trim();
    if (!code) return;
    const exact = (list: LineProduct[]) => {
      const c = code.toUpperCase();
      return list.find((p) => (p.barcode && p.barcode.toUpperCase() === c) || (p.code && p.code.toUpperCase() === c));
    };
    const fromOpen = open ? exact(items) ?? items[active] : undefined;
    if (fromOpen) { pick(fromOpen, exact(items) ? 'scan' : 'pick'); return; }
    const list = await search(code);
    if (!list) return;
    const hit = exact(list) ?? (list.length === 1 ? list[0] : undefined);
    if (hit) { pick(hit, 'scan'); return; }
    if (list.length === 0) { toast(tr(t.scanNotFound, { code }), 'warn'); setOpen(false); return; }
    setItems(list);
    setActive(0);
    setOpen(true);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + items.length) % items.length); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  }

  return (
    <div
      className="rc-picker"
      onKeyDown={onKeyDown}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}
    >
      <label className="sr-only" htmlFor={`${listId}-q`}>{t.searchProduct}</label>
      <BarcodeInputField
        id={`${listId}-q`}
        key={resetKey}
        placeholder={t.searchProduct}
        disabled={disabled}
        clearOnScan
        onValueChange={onType}
        onScan={onScan}
        className="rc-picker-field"
      />
      <span className="rc-picker-hint">{loading ? t.searching : t.searchHint}</span>
      <span className="sr-only" aria-live="polite">{open ? (items.length ? `${items.length}` : t.noResults) : ''}</span>
      {open && (
        <ul className="rc-results" id={`${listId}-list`} role="listbox" aria-label={t.searchProduct}>
          {items.length === 0 ? (
            <li className="rc-res-empty">{t.noResults}</li>
          ) : items.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`rc-res${i === active ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                // Fokus maydonda qoladi — blur ro'yxatni bosishdan oldin yopib qo'ymasin (iOS Safari)
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p, 'pick')}
              >
                <span className="rc-res-main">
                  <b>{p.name}</b>
                  <small>{[p.code, p.barcode && p.barcode !== p.code ? p.barcode : null].filter(Boolean).join(' · ') || '—'}</small>
                </span>
                <small className="rc-res-side">
                  {p.available !== null ? tr(t.available, { qty: qtyWithUnit(p.available, p.unit, units) }) : ''}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
