'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import type { ProductOption } from '@/lib/production/catalog';
import { qtyText, type PickedProduct } from './ui';

interface Props {
  /** Qaysi ombordagi hujjatlar (GET /api/production/products?branchId=) */
  branchId: string;
  onPick: (p: PickedProduct) => void;
  /** Ro'yxatda ko'rsatilmaydigan mahsulotlar (allaqachon qo'shilgan) — id yoki kod */
  exclude?: ReadonlySet<string>;
  placeholder: string;
  /** Ko'rinadigan yorliq bo'lmasa */
  label?: string;
  disabled?: boolean;
  className?: string;
}

const DEBOUNCE_MS = 250;

/**
 * Mahsulot qidiruvi (combobox): nomi, kodi, shtrix-kodi; natijada ombordagi qoldiq. Klaviatura: ↑ ↓ Enter Esc.
 * Bo'sh qidiruvda ham ro'yxat (A–Z, 50 tagacha) — fokusda ochiladi.
 */
export default function ProductPicker({ branchId, onPick, exclude, placeholder, label, disabled, className }: Props) {
  const d = useDict();
  const t = d.production.recipes.picker;
  const units = d.stock.fields.units;
  const listId = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Qidiruv (kechiktirilgan); ombor yoki matn o'zgarsa qayta so'raladi
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    // Birinchi javobgacha «topilmadi» emas, «qidirilmoqda» ko'rinsin
    setLoading(true);
    const timer = setTimeout(async () => {
      setError(null);
      try {
        const qs = new URLSearchParams({ branchId, limit: '30' });
        if (q.trim()) qs.set('q', q.trim());
        const res = await fetch(`/api/production/products?${qs}`, { signal: ctrl.signal, cache: 'no-store' });
        const body = (await res.json().catch(() => null)) as { items?: ProductOption[]; error?: string } | null;
        if (!res.ok || !body?.items) {
          setItems([]);
          setError(body?.error || t.error);
        } else {
          setItems(body.items);
          setActive(0);
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setItems([]);
          setError(t.error);
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, branchId, open, t.error]);

  const shown = items.filter((p) => !exclude?.has(p.id) && !(p.code && exclude?.has(p.code)));

  function pick(p: ProductOption) {
    onPick({
      id: p.id, code: p.code, name: p.name, unit: p.unit, purchaseUnit: p.purchaseUnit,
      purchaseFactor: p.purchaseFactor, available: p.available,
    });
    setQ('');
    setOpen(false);
    inputRef.current?.focus();
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((i) => Math.min(i + 1, Math.max(shown.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && shown[active]) {
        e.preventDefault();
        pick(shown[active]);
      }
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  }

  const activeId = open && shown[active] ? `${listId}-o${active}` : undefined;

  return (
    <div className={`pr-pick${className ? ` ${className}` : ''}`}>
      <Icon name="search" size={16} className="pr-pick-ic" />
      <input
        ref={inputRef}
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        aria-label={label ?? placeholder}
        placeholder={placeholder}
        value={q}
        disabled={disabled}
        autoComplete="off"
        maxLength={80}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKey}
      />
      {open && (
        <ul id={listId} role="listbox" className="pr-pick-list" aria-label={label ?? placeholder}>
          {loading && shown.length === 0 ? (
            <li className="pr-pick-msg" role="presentation">{t.loading}</li>
          ) : error ? (
            <li className="pr-pick-msg pr-pick-msg--err" role="presentation">{error}</li>
          ) : shown.length === 0 ? (
            <li className="pr-pick-msg" role="presentation">{t.none}</li>
          ) : (
            shown.map((p, i) => (
              <li
                key={p.id}
                id={`${listId}-o${i}`}
                role="option"
                aria-selected={i === active}
                className={`pr-pick-opt${i === active ? ' is-active' : ''}`}
                // blur'dan oldin tanlansin
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="pr-pick-t">
                  <b>{p.name}</b>
                  {p.code && <small>{p.code}</small>}
                </span>
                <small className={`pr-pick-q${p.available > 0 ? '' : ' is-zero'}`}>
                  {tr(t.stock, { qty: qtyText(p.available, p.unit, units) })}
                </small>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
