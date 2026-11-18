'use client';

import { useId, useMemo, useRef, useState, useTransition } from 'react';
import Icon from '@/components/icons/Icon';
import PriceInput from '@/components/ui/PriceInput';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import { fmtQty, parseQty } from '@/lib/qty';
import { toast } from '@/lib/toast';
import type { StockOption } from '@/lib/restaurant/menuAdmin';
import { fromBaseQty, marginPct, portionsFrom, preferredRecipeUnit, recipeLineCost, recipeUnitsFor, toBaseQty } from '@/lib/restaurant/recipeUnits';
import { quickCreateIngredientAction } from '@/app/actions/menu';

/** Retsept qatori (muharrir holati): kiritilgan son va tanlangan birlik */
export interface RecipeRow {
  key: string;
  productId: string;
  /** Kiritilgan son (matn, «150» yoki «0,15») */
  input: string;
  /** Kiritish birligi (g, kg, ml, l, dona…) */
  unit: string;
}

let seq = 0;
const newKey = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Qidiruv uchun: kichik harf, tutuq belgilarisiz («go'sht», «goʻsht», «gosht» — bir xil) */
export const searchKey = (s: string) => s.toLowerCase().replace(/['ʻʼ`‘’]/g, '').trim();

/** Saqlangan retsept → muharrir qatorlari (qulay birlikda: 0,15 kg → 150 g) */
export function toRecipeRows(recipe: { productId: string; qty: number }[], stock: StockOption[]): RecipeRow[] {
  const byId = new Map(stock.map((s) => [s.id, s]));
  return recipe.map((r) => {
    const base = byId.get(r.productId)?.unit ?? null;
    const u = preferredRecipeUnit(base, r.qty);
    return { key: newKey(), productId: r.productId, input: fmtQty(fromBaseQty(r.qty, u.factor)), unit: u.unit };
  });
}

/** Qator → asosiy birlikdagi miqdor (yaroqsiz — null) */
export function rowBaseQty(row: RecipeRow, base: string | null): number | null {
  const u = recipeUnitsFor(base).find((x) => x.unit === row.unit) ?? recipeUnitsFor(base)[0];
  const n = parseQty(row.input, u.factor < 1 ? null : 'kg');
  return n === null ? null : toBaseQty(n, u.factor, base);
}

interface Props {
  rows: RecipeRow[];
  onChange: (rows: RecipeRow[]) => void;
  stock: StockOption[];
  /** Yangi xom ashyo qo'shilganda — formaning ombor ro'yxatiga */
  onStockAdd: (s: StockOption) => void;
  price: number;
  branchId: string;
  canViewCost: boolean;
  canCreate: boolean;
  disabled?: boolean;
  /** Xato qatori (key) */
  errorKey?: string | null;
}

/**
 * Retsept muharriri: xom ashyo qidiruvi (menyuda bo'lmagan ombor tovarlari), miqdor + birlik (kg → g/kg, l → ml/l,
 * dona), qator va jami tannarx, foyda %, joriy qoldiqdan porsiya soni; «Yangi xom ashyo» — omborga tez qo'shish.
 */
export default function RecipeEditor({ rows, onChange, stock, onStockAdd, price, branchId, canViewCost, canCreate, disabled, errorKey }: Props) {
  const d = useDict();
  const t = d.menu.recipe;
  const uid = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const qtyRefs = useRef(new Map<string, HTMLInputElement>());
  const byId = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock]);
  const used = new Set(rows.map((r) => r.productId));
  const unitLabel = (u: string) => d.menu.units[u] ?? d.stock.fields.units[u as keyof typeof d.stock.fields.units] ?? u;
  const qtyText = (qty: number, unit: string | null) => `${fmtQty(qty)} ${unitLabel(unit ?? 'dona')}`;

  const query = searchKey(q);
  const matches = stock.filter((s) => s.tracked && !used.has(s.id) && (!query || searchKey(s.name).includes(query))).slice(0, 8);

  function add(s: StockOption) {
    const u = preferredRecipeUnit(s.unit, null);
    const row: RecipeRow = { key: newKey(), productId: s.id, input: '', unit: u.unit };
    onChange([...rows, row]);
    setQ('');
    setOpen(false);
    // Miqdor maydoniga o'tish
    requestAnimationFrame(() => qtyRefs.current.get(row.key)?.focus());
  }

  const patch = (key: string, p: Partial<RecipeRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...p } : r)));

  // Jami: tannarx va porsiya (faqat to'g'ri kiritilgan qatorlar)
  let total = 0;
  const portionItems: { qty: number; available: number }[] = [];
  let allValid = rows.length > 0;
  for (const r of rows) {
    const s = byId.get(r.productId);
    const qty = rowBaseQty(r, s?.unit ?? null);
    if (qty === null || !s) { allValid = false; continue; }
    total += recipeLineCost(s.cost, qty);
    portionItems.push({ qty, available: s.available });
  }
  const portions = allValid ? portionsFrom(portionItems) : null;
  const margin = marginPct(price, total);

  return (
    <div className="mn-recipe">
      {rows.length === 0 ? (
        <p className="rs-hint mn-recipe-empty">{t.empty}</p>
      ) : (
        <ul className="mn-lines" aria-label={t.title}>
          {rows.map((r) => {
            const s = byId.get(r.productId);
            const base = s?.unit ?? null;
            const units = recipeUnitsFor(base);
            const qty = rowBaseQty(r, base);
            const bad = errorKey === r.key || (r.input.trim() !== '' && qty === null);
            const name = s?.name ?? '—';
            return (
              <li key={r.key} className={`mn-line${bad ? ' is-error' : ''}`}>
                <span className="mn-line-t">
                  <b>{name}</b>
                  <small>{tr(t.stock, { qty: qtyText(s?.available ?? 0, base) })}{canViewCost && s ? ` · ${fmtMoney(s.cost)} ${d.common.sum}/${unitLabel(base ?? 'dona')}` : ''}</small>
                </span>
                <span className="mn-line-qty">
                  <input
                    ref={(el) => { if (el) qtyRefs.current.set(r.key, el); else qtyRefs.current.delete(r.key); }}
                    className="input"
                    inputMode="decimal"
                    value={r.input}
                    onChange={(e) => patch(r.key, { input: e.target.value.replace(/[^\d.,]/g, '') })}
                    placeholder="0"
                    aria-label={`${t.qty}: ${name}`}
                    aria-invalid={bad || undefined}
                    disabled={disabled}
                  />
                  {units.length > 1 ? (
                    <select
                      className="input"
                      value={r.unit}
                      onChange={(e) => {
                        // Birlik almashsa — son ham shu birlikka o'giriladi (150 g → 0,15 kg)
                        const next = units.find((u) => u.unit === e.target.value) ?? units[0];
                        patch(r.key, { unit: next.unit, input: qty !== null ? fmtQty(fromBaseQty(qty, next.factor)) : r.input });
                      }}
                      aria-label={`${t.unit}: ${name}`}
                      disabled={disabled}
                    >
                      {units.map((u) => <option key={u.unit} value={u.unit}>{unitLabel(u.unit)}</option>)}
                    </select>
                  ) : (
                    <span className="mn-line-unit">{unitLabel(units[0].unit)}</span>
                  )}
                </span>
                {canViewCost && (
                  <span className="mn-line-cost">{qty !== null && s ? `${fmtMoney(recipeLineCost(s.cost, qty))}` : '—'}</span>
                )}
                <button
                  type="button"
                  className="btn btn-plain btn-sm mn-line-x"
                  onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
                  aria-label={tr(t.removeFor, { name })}
                  disabled={disabled}
                >
                  <Icon name="close" size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Xom ashyo qidiruvi */}
      <div className="mn-search">
        <label className="sr-only" htmlFor={`${uid}-q`}>{t.searchLabel}</label>
        <span className="mn-search-ic" aria-hidden="true"><Icon name="search" size={16} /></span>
        <input
          id={`${uid}-q`}
          className="input"
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (matches[0]) add(matches[0]); }
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={t.searchPh}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${uid}-list`}
          disabled={disabled}
        />
        {canCreate && (
          <button type="button" className="btn btn-tinted btn-sm btn-with-icon" onClick={() => setAdding((v) => !v)} aria-expanded={adding} disabled={disabled}>
            <Icon name="plus" size={15} /> {t.addNew}
          </button>
        )}
        {open && (query || matches.length > 0) && (
          <ul className="mn-pop" id={`${uid}-list`} role="listbox" aria-label={t.searchLabel}>
            {matches.length === 0 ? (
              <li className="mn-pop-none">{t.noMatch}</li>
            ) : matches.map((s) => (
              <li key={s.id} role="option" aria-selected={false}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)}>
                  <b>{s.name}</b>
                  <small className={s.available > 0 ? '' : 'mn-zero'}>{tr(t.stock, { qty: qtyText(s.available, s.unit) })}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {adding && canCreate && (
        <NewIngredient
          branchId={branchId}
          canViewCost={canViewCost}
          onCancel={() => setAdding(false)}
          onCreated={(s) => {
            onStockAdd(s);
            setAdding(false);
            const u = preferredRecipeUnit(s.unit, null);
            const row: RecipeRow = { key: newKey(), productId: s.id, input: '', unit: u.unit };
            onChange([...rows, row]);
            requestAnimationFrame(() => qtyRefs.current.get(row.key)?.focus());
          }}
        />
      )}

      {/* Jami */}
      {rows.length > 0 && (
        <div className="mn-sum" aria-live="polite">
          {canViewCost ? (
            <>
              <span><small>{t.total}</small><b>{fmtMoney(total)} {d.common.sum}</b></span>
              <span><small>{t.profit}</small><b className={margin !== null && margin < 30 ? 'mn-low' : 'mn-good'}>{price > 0 ? `${fmtMoney(price - total)} ${d.common.sum}` : '—'}{margin !== null ? ` · ${fmtQty(margin)}%` : ''}</b></span>
            </>
          ) : (
            <span className="rs-hint">{t.noCost}</span>
          )}
          {portions !== null && (
            <span className={`mn-sum-portions${portions === 0 ? ' is-zero' : ''}`}>
              {portions === 0 ? t.portionsNone : tr(t.portions, { n: portions })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const NEW_UNITS = ['kg', 'l', 'dona', 'g'] as const;

function NewIngredient({ branchId, canViewCost, onCancel, onCreated }: {
  branchId: string;
  canViewCost: boolean;
  onCancel: () => void;
  onCreated: (s: StockOption) => void;
}) {
  const d = useDict();
  const t = d.menu.recipe;
  const uid = useId();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<(typeof NEW_UNITS)[number]>('kg');
  const [cost, setCost] = useState('');
  const [qty, setQty] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const unitLabel = (u: string) => d.menu.units[u] ?? u;

  function submit() {
    const n = parseQty(qty, unit);
    if (!name.trim()) { setError(d.menu.errors.nameRequired); return; }
    if (n === null) { setError(d.menu.errors.badStockQty); return; }
    setError(null);
    start(async () => {
      try {
        const r = await quickCreateIngredientAction({ branchId, name: name.trim(), unit, cost: Number(cost || 0), qty: n });
        if (!r.ok) { setError(r.error); return; }
        if (r.success) toast(r.success, 'success');
        onCreated(r.data);
      } catch {
        setError(d.common.errorGeneric);
      }
    });
  }

  // Ichki forma: asosiy forma ichida bo'lgani uchun <form> emas (Enter — shu yerda saqlaydi)
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
  return (
    <div className="mn-newing" role="group" aria-labelledby={`${uid}-h`}>
      <b id={`${uid}-h`} className="rs-label">{t.newTitle}</b>
      <div className="mn-newing-grid">
        <label className="rs-mini rs-mini--grow">
          <span>{t.newName}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onKey} placeholder={t.newNamePh} maxLength={120} autoFocus />
        </label>
        <label className="rs-mini">
          <span>{t.newUnit}</span>
          <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as (typeof NEW_UNITS)[number])}>
            {NEW_UNITS.map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
          </select>
        </label>
        <label className="rs-mini rs-mini--wide">
          <span>{tr(t.newCost, { unit: unitLabel(unit) })}</span>
          <PriceInput value={cost} onValueChange={setCost} className="input" ariaLabel={tr(t.newCost, { unit: unitLabel(unit) })} disabled={!canViewCost} />
        </label>
        <label className="rs-mini">
          <span>{t.newQty}</span>
          <input className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.,]/g, ''))} onKeyDown={onKey} placeholder={unit === 'dona' ? '10' : '5'} />
        </label>
      </div>
      {error && <p className="rs-error" role="alert">{error}</p>}
      <div className="rs-row-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={pending}>{pending ? d.common.saving : t.create}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>{d.common.cancel}</button>
      </div>
    </div>
  );
}
