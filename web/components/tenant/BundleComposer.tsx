'use client';

import { useMemo, useState } from 'react';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import { fmtQty, isFractionalUnit, parseQty } from '@/lib/qty';
import type { ProductUnit } from '@/lib/businessTypes';

/** To'plamga qo'shish mumkin bo'lgan tovar: shu omborning sanaladigan tovari */
export interface BundleCandidate {
  id: string;
  name: string;
  unit: ProductUnit | null;
  available: number;
  purchasePrice: number;
}

interface Line { id: string; qty: string }

/**
 * To'plam tarkibi: tovar tanlanadi va 1 to'plamdagi miqdori kiritiladi.
 * Forma `bundleItems` (JSON) maydonini yuboradi — server lib/productKinds.ts → parseBundleItems bilan tekshiradi.
 */
export default function BundleComposer({
  candidates,
  initial = [],
  disabled,
  showCost,
}: {
  candidates: BundleCandidate[];
  initial?: { productId: string; qty: number }[];
  disabled?: boolean;
  showCost?: boolean;
}) {
  const d = useDict();
  const t = d.stock.bundle;
  const units = d.stock.fields.units;
  const [lines, setLines] = useState<Line[]>(() => initial.map((i) => ({ id: i.productId, qty: fmtQty(i.qty) })));
  const [query, setQuery] = useState('');

  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const picked = new Set(lines.map((l) => l.id));
  const q = query.trim().toLowerCase();
  const options = candidates.filter((c) => !picked.has(c.id) && (!q || c.name.toLowerCase().includes(q))).slice(0, 8);

  const parsed = lines.map((l) => ({ l, c: byId.get(l.id), qty: parseQty(l.qty, byId.get(l.id)?.unit) }));
  const cost = parsed.reduce((s, x) => s + Math.round((x.c?.purchasePrice ?? 0) * (x.qty ?? 0)), 0);
  // Nechta to'plam yig'iladi — eng kam yetadigan tarkib bo'yicha
  const canMake = parsed.length && parsed.every((x) => x.c && x.qty)
    ? Math.min(...parsed.map((x) => Math.floor((x.c!.available) / x.qty!)))
    : 0;
  const json = JSON.stringify(parsed.filter((x) => x.qty !== null).map((x) => ({ productId: x.l.id, qty: x.qty })));

  return (
    <div className="st-bundle">
      <input type="hidden" name="bundleItems" value={json} />
      {lines.length === 0 ? (
        <p className="st-bundle-empty">{t.empty}</p>
      ) : (
        <ul className="st-bundle-list">
          {parsed.map(({ l, c, qty }) => (
            <li key={l.id} className={qty === null ? 'is-bad' : undefined}>
              <span className="st-bundle-name">
                <b>{c?.name ?? '—'}</b>
                <small>{tr(t.inStock, { n: c ? fmtQty(c.available) : '0' })}{c?.unit && c.unit !== 'dona' ? ` ${units[c.unit]}` : ''}</small>
              </span>
              <span className="st-bundle-qty">
                <span className="sr-only">{t.qtyLabel}</span>
                <input
                  className="input"
                  value={l.qty}
                  inputMode={isFractionalUnit(c?.unit) ? 'decimal' : 'numeric'}
                  aria-label={`${t.qtyLabel}: ${c?.name ?? ''}`}
                  aria-invalid={qty === null}
                  disabled={disabled}
                  onChange={(e) => setLines((ls) => ls.map((x) => (x.id === l.id ? { ...x, qty: e.target.value } : x)))}
                />
                <small>{c?.unit ? units[c.unit] : units.dona}</small>
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm st-bundle-del"
                onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}
                aria-label={`${t.remove}: ${c?.name ?? ''}`}
                disabled={disabled}
              >
                <Icon name="trash" size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="st-bundle-add">
        <div className="st-search-field">
          <Icon name="search" size={16} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={candidates.length ? t.searchPh : t.noCandidates}
            aria-label={t.searchPh}
            disabled={disabled || !candidates.length}
          />
        </div>
        {options.length > 0 && (q || lines.length === 0) && (
          <ul className="st-bundle-opts" role="listbox" aria-label={t.searchPh}>
            {options.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => { setLines((ls) => [...ls, { id: c.id, qty: '1' }]); setQuery(''); }}
                >
                  <span>{c.name}</span>
                  <small>{tr(t.inStock, { n: fmtQty(c.available) })}</small>
                  <Icon name="plus" size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lines.length > 0 && (
        <p className="st-bundle-sum">
          {tr(t.canMake, { n: canMake })}
          {showCost && <> · {tr(t.cost, { sum: fmtMoney(cost) })}</>}
        </p>
      )}
    </div>
  );
}
