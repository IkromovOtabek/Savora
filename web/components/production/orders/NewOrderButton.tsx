'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { isFractionalUnit, parseQty } from '@/lib/qty';
import { tashkentDayKey } from '@/lib/period';
import type { ProductUnit } from '@/lib/businessTypes';
import { PRODUCTION_LIMITS as L } from '@/lib/production/calc';
import type { Requirements } from '@/lib/production/recipes';
import { createProductionOrderAction } from '@/app/actions/production';
import Dialog from '../common/Dialog';
import ShortageList from '../common/ShortageList';
import { useProdRun } from '../common/useProdRun';
import { cleanQtyInput, newClientId, qtyText, unitName, type BranchOption } from '../common/ui';

export interface RecipeChoice {
  id: string;
  name: string;
  outputName: string;
  outputQty: number;
  unit: ProductUnit | null;
}

interface Props {
  recipes: RecipeChoice[];
  /** Xom ashyo ombori tanlovi (admin — hammasi, filial xodimi — o'zi) */
  branches: BranchOption[];
  /** Tayyor mahsulot ombori tanlovi — barcha faol omborlar (meta.toBranches) */
  toBranches: BranchOption[];
  defaultBranchId: string;
  /** Filial xodimi — xom ashyo ombori faqat o'ziniki */
  scoped: boolean;
  initialRecipeId?: string;
  label?: string;
  tinted?: boolean;
}

const PREVIEW_DEBOUNCE_MS = 400;

/**
 * «Yangi akt» tugmasi + oyna: texkarta, reja miqdori, xom ashyo va tayyor mahsulot omborlari, muddat (`dueDate`),
 * mijoz buyurtmasi (`customerRef`), izoh. Oynada ehtiyoj oldindan ko'rinadi (GET …/requirements). Takroriy bosishdan —
 * `clientId`. Filial xodimi xom ashyoni faqat o'z omboridan oladi, tayyor mahsulotni istalgan faol omborga yo'naltiradi.
 */
export default function NewOrderButton({ recipes, branches, toBranches, defaultBranchId, scoped, initialRecipeId, label, tinted }: Props) {
  const d = useDict();
  const t = d.production.orders;
  const units = d.stock.fields.units;
  const router = useRouter();
  const { pending, run } = useProdRun();

  const [open, setOpen] = useState(false);
  const [recipeId, setRecipeId] = useState(initialRecipeId ?? (recipes.length === 1 ? recipes[0].id : ''));
  const [qty, setQty] = useState('');
  const [from, setFrom] = useState(defaultBranchId);
  const [to, setTo] = useState(defaultBranchId);
  const [due, setDue] = useState('');
  const [customer, setCustomer] = useState('');
  const [note, setNote] = useState('');
  const [clientId, setClientId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ loading: boolean; data: Requirements | null }>({ loading: false, data: null });

  const recipe = recipes.find((r) => r.id === recipeId) ?? null;
  const planned = recipe ? parseQty(qty, recipe.unit) : null;

  function openDialog() {
    setClientId(newClientId());
    setError(null);
    if (recipe && !qty) setQty(String(recipe.outputQty).replace('.', ','));
    setOpen(true);
  }

  // Ehtiyoj (oldindan): texkarta + yaroqli miqdor + xom ashyo ombori
  useEffect(() => {
    if (!open || !recipe || planned === null) {
      setPreview({ loading: false, data: null });
      return;
    }
    const ctrl = new AbortController();
    setPreview((p) => ({ loading: true, data: p.data }));
    const timer = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ qty: String(planned), branchId: from });
        const res = await fetch(`/api/production/recipes/${recipe.id}/requirements?${qs}`, { signal: ctrl.signal, cache: 'no-store' });
        const body = res.ok ? ((await res.json()) as Requirements) : null;
        setPreview({ loading: false, data: body });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setPreview({ loading: false, data: null });
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, recipe, planned, from]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!recipe) return setError(t.errRecipe);
    if (planned === null) return setError(t.errQty);
    if (note.trim().length > L.noteMax) return setError(tr(t.noteTooLong, { n: L.noteMax }));
    setError(null);
    run(
      () => createProductionOrderAction({
        recipeId: recipe.id,
        plannedQty: planned,
        ...(scoped ? {} : { fromBranchId: from }),
        toBranchId: to,
        ...(due ? { dueDate: new Date(`${due}T00:00:00.000Z`) } : {}),
        ...(customer.trim() ? { customerRef: customer.trim() } : {}),
        note: note.trim(),
        clientId,
      }),
      {
        refresh: false,
        after: (data) => {
          setOpen(false);
          router.push(`/app/production/${data.order.id}`);
        },
        onError: (er) => {
          setError(er.error);
        },
      },
    );
  }

  const short = preview.data ? preview.data.lines.filter((l) => l.shortage > 0) : [];
  const fromName = branches.find((b) => b.id === from)?.name ?? '';

  return (
    <>
      <button type="button" className={`btn ${tinted ? 'btn-tinted btn-sm' : 'btn-primary'} btn-with-icon`} onClick={openDialog}>
        <Icon name="plus" size={16} /> {label ?? t.add}
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={t.newTitle} wide>
        {recipes.length === 0 ? (
          <div className="pr-stack">
            <p className="pr-hint">{t.noRecipes}</p>
            <Link href="/app/production/recipes" className="btn btn-tinted">{t.toRecipes}</Link>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <label className="pr-field">
              <span>{t.recipe}</span>
              <select
                className="input"
                value={recipeId}
                onChange={(e) => {
                  const r = recipes.find((x) => x.id === e.target.value);
                  setRecipeId(e.target.value);
                  if (r) setQty(String(r.outputQty).replace('.', ','));
                }}
                required
                disabled={pending}
              >
                <option value="" disabled>{t.recipePh}</option>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name === r.outputName ? r.name : `${r.name} — ${r.outputName}`}</option>
                ))}
              </select>
            </label>

            <label className="pr-field">
              <span>{t.plannedQty}</span>
              <span className="pr-suffix">
                <input
                  className="input"
                  inputMode={recipe && isFractionalUnit(recipe.unit) ? 'decimal' : 'numeric'}
                  value={qty}
                  onChange={(e) => setQty(cleanQtyInput(e.target.value, recipe?.unit ?? null))}
                  aria-invalid={(qty !== '' && planned === null) || undefined}
                  aria-describedby="pr-no-qty-h"
                  required
                  disabled={pending || !recipe}
                />
                <span>{unitName(recipe?.unit, units)}</span>
              </span>
              {recipe && <small id="pr-no-qty-h">{tr(t.batchHint, { qty: qtyText(recipe.outputQty, recipe.unit, units) })}</small>}
            </label>

            {(branches.length > 1 || toBranches.length > 1) && (
              <div className="pr-grid2">
                <label className="pr-field">
                  <span>{d.production.common.fromBranch}</span>
                  <select className="input" value={from} onChange={(e) => setFrom(e.target.value)} disabled={pending || scoped || branches.length < 2}>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
                <label className="pr-field">
                  <span>{d.production.common.toBranch}</span>
                  <select className="input" value={to} onChange={(e) => setTo(e.target.value)} disabled={pending || toBranches.length < 2} aria-describedby="pr-no-to-h">
                    {(toBranches.length ? toBranches : branches).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <small id="pr-no-to-h">{t.toBranchHint}</small>
                </label>
              </div>
            )}

            <div className="pr-grid2">
              <label className="pr-field">
                <span>{t.due}</span>
                <input className="input" type="date" value={due} min={tashkentDayKey(new Date())} onChange={(e) => setDue(e.target.value)} disabled={pending} />
              </label>
              <label className="pr-field">
                <span>{t.customerOrder}</span>
                <input className="input" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder={t.customerOrderPh} maxLength={L.customerRefMax} disabled={pending} />
              </label>
            </div>

            <label className="pr-field">
              <span>{d.production.common.note}</span>
              <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={L.noteMax} disabled={pending} aria-describedby="pr-no-note-h" />
              <small id="pr-no-note-h">{t.noteHint}</small>
            </label>

            {recipe && planned !== null && (
              <div aria-live="polite">
                {preview.loading && !preview.data ? (
                  <p className="pr-hint">{t.previewLoading}</p>
                ) : preview.data ? (
                  short.length === 0 ? (
                    <p className="pr-req-ok">{t.previewOk}{fromName && branches.length > 1 ? ` (${fromName})` : ''}</p>
                  ) : (
                    <ShortageList
                      title={t.previewTitle}
                      hint={tr(t.previewShort, { n: short.length })}
                      rows={short.map((l) => ({ code: l.code, name: l.name, unit: l.unit, need: l.required, available: l.available }))}
                      d={d}
                      canReceive={false}
                    />
                  )
                ) : null}
              </div>
            )}

            {error && <p className="pr-error" role="alert">{error}</p>}
            <div className="pr-actions pr-actions--end">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={pending}>{d.common.cancel}</button>
              <button type="submit" className="btn btn-primary" disabled={pending || !recipe || planned === null}>
                {pending ? d.common.saving : t.create}
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
