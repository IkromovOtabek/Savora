'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons/Icon';
import PriceInput from '@/components/ui/PriceInput';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtQty } from '@/lib/qty';
import type { ProductUnit } from '@/lib/businessTypes';
import { PRODUCTION_LIMITS as L } from '@/lib/production/calc';
import type { RecipeView } from '@/lib/production/recipes';
import { saveRecipeAction, setRecipeActiveAction } from '@/app/actions/production';
import ProductPicker from '../common/ProductPicker';
import { useProdRun } from '../common/useProdRun';
import { cleanQtyInput, parseNorm, qtyText, unitName, type BranchOption, type PickedProduct } from '../common/ui';

const BASE = '/app/production/recipes';

interface ItemLine {
  key: string;
  code: string;
  name: string;
  /** null — mahsulot omborda topilmadi (o'chirilgan) */
  product: PickedProduct | null;
  qty: string;
  unit: ProductUnit | null;
  loss: string;
}
interface OpLine {
  key: string;
  name: string;
  rate: string;
  norm: string;
}

interface Props {
  /** null — yangi texkarta */
  recipe: RecipeView | null;
  /** Kod → mahsulot (server topgan; tahrir uchun `productId`) */
  products: Record<string, PickedProduct>;
  branches: BranchOption[];
  branchId: string;
  canManage: boolean;
}

let seq = 0;
const key = () => `k${++seq}`;

function initItems(recipe: RecipeView | null, products: Record<string, PickedProduct>): ItemLine[] {
  return (recipe?.items ?? []).map((i) => {
    const p = products[i.code] ?? null;
    return { key: key(), code: i.code, name: p?.name ?? i.name, product: p, qty: fmtQty(i.qty), unit: p?.unit ?? i.unit, loss: i.lossPct ? fmtQty(i.lossPct) : '' };
  });
}

function initOps(recipe: RecipeView | null): OpLine[] {
  return (recipe?.operations ?? []).map((o) => ({ key: key(), name: o.name, rate: o.rate ? String(o.rate) : '', norm: o.normMin != null ? fmtQty(o.normMin) : '' }));
}

/**
 * Texkarta muharriri: nomi, tayyor mahsulot va chiqish miqdori (partiya), xom ashyo qatorlari (asosiy yoki xarid
 * birligi, yo'qotish %), operatsiyalar (narx 1 birlikka, norma daqiqa), ustama, izoh; faol/arxiv. Tarkib o'zgarsa
 * server yangi versiya yozadi (`expectedVersion` — boshqa birov o'zgartirgan bo'lsa `conflict`).
 */
export default function RecipeEditor({ recipe, products, branches, branchId, canManage }: Props) {
  const d = useDict();
  const t = d.production.recipes;
  const units = d.stock.fields.units;
  const router = useRouter();
  const { pending, run } = useProdRun();
  const ro = !canManage;

  const [name, setName] = useState(recipe?.name ?? '');
  const [output, setOutput] = useState<PickedProduct | null>(() => (recipe ? products[recipe.outputCode] ?? null : null));
  const [pickOutput, setPickOutput] = useState(!recipe);
  const [outputQty, setOutputQty] = useState(recipe ? fmtQty(recipe.outputQty) : '1');
  const [items, setItems] = useState<ItemLine[]>(() => initItems(recipe, products));
  const [ops, setOps] = useState<OpLine[]>(() => initOps(recipe));
  const [overhead, setOverhead] = useState(recipe?.overheadPerUnit ? String(recipe.overheadPerUnit) : '');
  const [note, setNote] = useState(recipe?.note ?? '');
  const [branch, setBranch] = useState(branchId);
  const [error, setError] = useState<string | null>(null);

  const snapshot = (s: { name: string; output: PickedProduct | null; outputQty: string; items: ItemLine[]; ops: OpLine[]; overhead: string; note: string }) =>
    JSON.stringify([s.name.trim(), s.output?.id ?? null, s.outputQty, s.items.map((i) => [i.code, i.qty, i.unit, i.loss]), s.ops.map((o) => [o.name.trim(), o.rate, o.norm]), s.overhead, s.note.trim()]);
  const current = snapshot({ name, output, outputQty, items, ops, overhead, note });
  const [initial, setInitial] = useState(current);
  const dirty = current !== initial;

  // Saqlanmagan o'zgarish bilan sahifani yopishdan oldin ogohlantirish
  useEffect(() => {
    if (!dirty || ro) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty, ro]);

  const taken = useMemo(() => new Set(items.flatMap((i) => [i.code, i.product?.id ?? ''].filter(Boolean))), [items]);
  const outputUnit = output?.unit ?? recipe?.unit ?? null;

  function addItem(p: PickedProduct) {
    if (!p.code) return;
    if (taken.has(p.code) || taken.has(p.id)) {
      setError(tr(t.errDuplicate, { name: p.name }));
      return;
    }
    setError(null);
    setItems((prev) => [...prev, { key: key(), code: p.code!, name: p.name, product: p, qty: '', unit: p.unit, loss: '' }]);
  }
  const patchItem = (k: string, part: Partial<ItemLine>) => setItems((prev) => prev.map((i) => (i.key === k ? { ...i, ...part } : i)));
  const patchOp = (k: string, part: Partial<OpLine>) => setOps((prev) => prev.map((o) => (o.key === k ? { ...o, ...part } : o)));

  function changeBranch(id: string) {
    setBranch(id);
    // Taxminiy tannarx va ehtiyoj shu ombor bo'yicha qayta o'qiladi (tahrir holati saqlanadi)
    const qs = new URLSearchParams(window.location.search);
    qs.set('b', id);
    router.replace(`${window.location.pathname}?${qs}`, { scroll: false });
  }

  /** Mijoz tomonida tekshiruv; xato matni yoki null */
  function validate(): string | null {
    if (!name.trim()) return t.errName;
    if (!output) return t.errOutput;
    const oq = parseNorm(outputQty);
    if (oq === null) return t.errOutputQty;
    if (!items.length) return t.errItems;
    if (items.length > L.maxRecipeItems || ops.length > L.maxRecipeOperations) return tr(t.errTooMany, { n: Math.max(L.maxRecipeItems, L.maxRecipeOperations) });
    for (const i of items) {
      if (!i.product) return tr(t.unresolved, { name: i.name });
      if (parseNorm(i.qty) === null) return tr(t.errQty, { name: i.name });
      const loss = i.loss.trim() === '' ? 0 : Number(i.loss.replace(',', '.'));
      if (!Number.isFinite(loss) || loss < 0 || loss > L.maxLossPct) return tr(t.errLoss, { name: i.name, max: L.maxLossPct });
      if (i.code === output.code) return t.errSelf;
    }
    for (const o of ops) {
      const norm = o.norm.trim() === '' ? 0 : Number(o.norm.replace(',', '.'));
      if (!o.name.trim() || !Number.isFinite(norm) || norm < 0 || norm > 100_000) return t.errOp;
    }
    return null;
  }

  function save() {
    const err = validate();
    setError(err);
    if (err || !output) return;
    run(
      () => saveRecipeAction({
        ...(recipe ? { id: recipe.id, expectedVersion: recipe.version } : {}),
        name: name.trim(),
        outputProductId: output.id,
        outputQty: parseNorm(outputQty)!,
        items: items.map((i) => ({
          productId: i.product!.id,
          qty: parseNorm(i.qty)!,
          unit: i.unit,
          lossPct: i.loss.trim() === '' ? 0 : Number(i.loss.replace(',', '.')),
        })),
        operations: ops.map((o) => ({
          name: o.name.trim(),
          rate: o.rate ? Number(o.rate) : 0,
          ...(o.norm.trim() ? { normMin: Number(o.norm.replace(',', '.')) } : {}),
        })),
        overheadPerUnit: overhead ? Number(overhead) : 0,
        note: note.trim(),
      }),
      {
        refresh: !!recipe,
        after: (data) => {
          setInitial(current);
          if (data.created) router.push(`${BASE}/${data.recipe.id}`);
        },
        onError: (e) => {
          setError(e.error);
        },
      },
    );
  }

  const unitOptions = (p: PickedProduct | null, current: ProductUnit | null): { value: ProductUnit | null; label: string }[] => {
    const base = (p?.unit ?? current ?? 'dona') as ProductUnit;
    const opts: { value: ProductUnit | null; label: string }[] = [{ value: base, label: unitName(base, units) }];
    if (p?.purchaseUnit && p.purchaseFactor && p.purchaseUnit !== base) {
      opts.push({
        value: p.purchaseUnit,
        label: `${unitName(p.purchaseUnit, units)} (${tr(d.production.common.factorLine, { unit: unitName(p.purchaseUnit, units), factor: fmtQty(p.purchaseFactor), base: unitName(base, units) })})`,
      });
    }
    return opts;
  };

  const disabled = ro || pending;

  return (
    <div className="pr-stack">
      {ro && <p className="t-note t-note--info">{t.readOnly}</p>}

      {/* ── Asosiy ── */}
      <section className="pr-card" aria-labelledby="pr-rc-main">
        <h2 className="pr-h" id="pr-rc-main">{t.main}</h2>
        <label className="pr-field">
          <span>{t.name}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePh} maxLength={120} disabled={disabled} required />
        </label>

        <div className="pr-field">
          <span className="pr-field-l" id="pr-rc-out">{t.output}</span>
          {output && !pickOutput ? (
            <div className="pr-chosen" aria-labelledby="pr-rc-out">
              <span className="pr-cell-main">
                <b>{output.name}</b>
                <small>{output.code}{output.available !== null ? ` · ${tr(t.picker.stock, { qty: qtyText(output.available, output.unit, units) })}` : ''}</small>
              </span>
              {!ro && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPickOutput(true)} disabled={pending}>{t.outputChange}</button>
              )}
            </div>
          ) : !ro ? (
            <div className="pr-search">
              <ProductPicker
                className="pr-grow"
                branchId={branch}
                placeholder={t.outputPh}
                label={t.output}
                exclude={taken}
                disabled={pending}
                onPick={(p) => {
                  setOutput(p);
                  setPickOutput(false);
                  if (!name.trim()) setName(p.name);
                }}
              />
              {output && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPickOutput(false)} disabled={pending}>{d.common.cancel}</button>
              )}
            </div>
          ) : (
            <p className="pr-error">{recipe ? tr(t.unresolved, { name: recipe.outputName }) : t.errOutput}</p>
          )}
          {!ro && <small>{t.outputHint}</small>}
          {recipe && !output && !ro && <p className="pr-error">{tr(t.unresolved, { name: recipe.outputName })}</p>}
        </div>

        <div className="pr-grid2">
          <label className="pr-field">
            <span>{t.outputQty}</span>
            <span className="pr-suffix">
              <input
                className="input"
                inputMode="decimal"
                value={outputQty}
                onChange={(e) => setOutputQty(cleanQtyInput(e.target.value, null, { fractional: true }))}
                aria-invalid={parseNorm(outputQty) === null || undefined}
                disabled={disabled}
                aria-describedby="pr-rc-oq-h"
              />
              <span>{unitName(outputUnit, units)}</span>
            </span>
            <small id="pr-rc-oq-h">{t.outputQtyHint}</small>
          </label>
          {branches.length > 1 && (
            <label className="pr-field">
              <span>{t.branch}</span>
              <select className="input" value={branch} onChange={(e) => changeBranch(e.target.value)} disabled={pending} aria-describedby="pr-rc-br-h">
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <small id="pr-rc-br-h">{t.branchHint}</small>
            </label>
          )}
        </div>
      </section>

      {/* ── Xom ashyo ── */}
      <section className="pr-card" aria-labelledby="pr-rc-items">
        <div className="pr-card-head">
          <div>
            <h2 className="pr-h" id="pr-rc-items">{t.items}</h2>
            <p className="pr-hint">{t.itemsHint}</p>
          </div>
          <span className="pr-muted">{tr(t.itemsCount, { n: items.length })}</span>
        </div>

        {items.length === 0 ? (
          <p className="pr-empty">{t.itemsEmpty}</p>
        ) : (
          <div className="pr-lines pr-lines--items">
            <div className="pr-lhead" aria-hidden="true">
              <span>{t.colMaterial}</span>
              <span className="pr-num">{t.colQty}</span>
              <span>{t.colUnit}</span>
              <span className="pr-num">{t.colLoss}</span>
              <span />
            </div>
            {items.map((i) => {
              const qtyBad = i.qty !== '' && parseNorm(i.qty) === null;
              const opts = unitOptions(i.product, i.unit);
              return (
                <div key={i.key} className={`pr-line${i.product ? '' : ' is-warn'}`}>
                  <span className="pr-cell pr-cell--main">
                    <span className="pr-cell-main">
                      <b>{i.name}</b>
                      <small>
                        {i.code}
                        {i.product?.available != null ? ` · ${tr(t.picker.stock, { qty: qtyText(i.product.available, i.product.unit, units) })}` : ''}
                      </small>
                      {!i.product && <small className="pr-error">{tr(t.unresolved, { name: i.name })}</small>}
                    </span>
                  </span>
                  <label className="pr-cell">
                    <span className="pr-cell-l">{t.colQty}</span>
                    <input
                      className="input pr-num"
                      inputMode="decimal"
                      value={i.qty}
                      onChange={(e) => patchItem(i.key, { qty: cleanQtyInput(e.target.value, null, { fractional: true }) })}
                      aria-label={`${t.colQty}: ${i.name}`}
                      aria-invalid={qtyBad || undefined}
                      placeholder="0"
                      disabled={disabled}
                    />
                  </label>
                  <label className="pr-cell">
                    <span className="pr-cell-l">{t.colUnit}</span>
                    {opts.length > 1 ? (
                      <select className="input" value={i.unit ?? ''} onChange={(e) => patchItem(i.key, { unit: e.target.value as ProductUnit })} aria-label={`${t.colUnit}: ${i.name}`} disabled={disabled}>
                        {opts.map((o) => <option key={o.value ?? 'dona'} value={o.value ?? ''}>{o.label}</option>)}
                      </select>
                    ) : (
                      <span className="pr-muted">{opts[0].label}</span>
                    )}
                  </label>
                  <label className="pr-cell">
                    <span className="pr-cell-l">{t.colLoss}</span>
                    <input
                      className="input pr-num"
                      inputMode="decimal"
                      value={i.loss}
                      onChange={(e) => patchItem(i.key, { loss: cleanQtyInput(e.target.value, null, { fractional: true }) })}
                      aria-label={`${t.colLoss}: ${i.name}`}
                      placeholder="0"
                      disabled={disabled}
                    />
                  </label>
                  <span className="pr-cell-act">
                    {!ro && (
                      <button type="button" className="icon-btn icon-btn--danger" onClick={() => setItems((prev) => prev.filter((x) => x.key !== i.key))} aria-label={`${t.remove}: ${i.name}`} title={t.remove} disabled={pending}>
                        <Icon name="trash" size={16} />
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {!ro && items.length < L.maxRecipeItems && (
          <ProductPicker branchId={branch} placeholder={t.itemSearchPh} exclude={new Set([...taken, ...(output?.code ? [output.code, output.id] : [])])} onPick={addItem} disabled={pending} />
        )}
      </section>

      {/* ── Operatsiyalar va ustama ── */}
      <section className="pr-card" aria-labelledby="pr-rc-ops">
        <div className="pr-card-head">
          <div>
            <h2 className="pr-h" id="pr-rc-ops">{t.operations}</h2>
            <p className="pr-hint">{t.opsHint}</p>
          </div>
          {!ro && ops.length < L.maxRecipeOperations && (
            <button type="button" className="btn btn-tinted btn-sm btn-with-icon" onClick={() => setOps((prev) => [...prev, { key: key(), name: '', rate: '', norm: '' }])} disabled={pending}>
              <Icon name="plus" size={15} /> {t.addOp}
            </button>
          )}
        </div>

        {ops.length === 0 ? (
          <p className="pr-empty">{t.opsEmpty}</p>
        ) : (
          <div className="pr-lines pr-lines--ops">
            <div className="pr-lhead" aria-hidden="true">
              <span>{t.opName}</span>
              <span className="pr-num">{t.opRate}</span>
              <span className="pr-num">{t.opNorm}</span>
              <span />
            </div>
            {ops.map((o, idx) => (
              <div key={o.key} className="pr-line">
                <label className="pr-cell pr-cell--main">
                  <span className="pr-cell-l">{t.opName}</span>
                  <input
                    className="input"
                    value={o.name}
                    onChange={(e) => patchOp(o.key, { name: e.target.value })}
                    placeholder={t.opNamePh}
                    maxLength={80}
                    aria-label={`${t.opName} ${idx + 1}`}
                    aria-invalid={(!o.name.trim() && !!error) || undefined}
                    disabled={disabled}
                  />
                </label>
                <label className="pr-cell">
                  <span className="pr-cell-l">{t.opRate}</span>
                  <PriceInput className="input pr-num" value={o.rate} onValueChange={(v) => patchOp(o.key, { rate: v })} ariaLabel={`${t.opRate}: ${o.name || idx + 1}`} placeholder="0" disabled={disabled} />
                </label>
                <label className="pr-cell">
                  <span className="pr-cell-l">{t.opNorm}</span>
                  <input
                    className="input pr-num"
                    inputMode="decimal"
                    value={o.norm}
                    onChange={(e) => patchOp(o.key, { norm: cleanQtyInput(e.target.value, null, { fractional: true }) })}
                    aria-label={`${t.opNorm}: ${o.name || idx + 1}`}
                    placeholder="—"
                    disabled={disabled}
                  />
                </label>
                <span className="pr-cell-act">
                  {!ro && (
                    <button type="button" className="icon-btn icon-btn--danger" onClick={() => setOps((prev) => prev.filter((x) => x.key !== o.key))} aria-label={`${t.remove}: ${o.name || idx + 1}`} title={t.remove} disabled={pending}>
                      <Icon name="trash" size={16} />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        <hr className="pr-sep" />
        <div className="pr-grid2">
          <label className="pr-field">
            <span>{t.overhead}</span>
            <PriceInput className="input" value={overhead} onValueChange={setOverhead} placeholder="0" disabled={disabled} ariaLabel={t.overhead} />
            <small>{t.overheadHint}</small>
          </label>
          <label className="pr-field">
            <span>{t.note}</span>
            <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={L.noteMax} rows={2} disabled={disabled} />
          </label>
        </div>
      </section>

      {/* ── Saqlash ── */}
      {!ro && (
        <div className="pr-card">
          {recipe && <p className="pr-hint">{t.versionHint}</p>}
          {error && <p className="pr-error" role="alert">{error}</p>}
          <div className="pr-actions pr-actions--end">
            {dirty && <span className="pr-unsaved">{d.production.orders.unsaved}</span>}
            <button type="button" className="btn btn-primary" onClick={save} disabled={pending || (!!recipe && !dirty)}>
              {pending ? d.common.saving : recipe ? t.save : t.create}
            </button>
          </div>
        </div>
      )}

      {/* ── Faol / arxiv ── */}
      {recipe && (
        <div className="pr-toggle">
          <b>{recipe.active ? t.statusActive : t.statusArchived}</b>
          {canManage && (
            <button
              type="button"
              className={`btn btn-sm ${recipe.active ? 'btn-ghost' : 'btn-tinted'}`}
              disabled={pending}
              onClick={() => run(() => setRecipeActiveAction({ id: recipe.id, active: !recipe.active }))}
            >
              {recipe.active ? t.archive : t.restore}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
