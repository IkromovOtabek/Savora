'use client';

import { useState } from 'react';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import { fmtQty, isFractionalUnit, parseQty } from '@/lib/qty';
import type { ProductUnit } from '@/lib/businessTypes';
import type { Requirements } from '@/lib/production/recipes';
import { recipeRequirementsAction } from '@/app/actions/production';
import ShortageList from '../common/ShortageList';
import { useProdRun } from '../common/useProdRun';
import { cleanQtyInput, qtyText, unitName, type BranchOption } from '../common/ui';

interface Props {
  recipeId: string;
  unit: ProductUnit | null;
  outputQty: number;
  branches: BranchOption[];
  branchId: string;
  canReceive: boolean;
  canPurchase: boolean;
}

/**
 * Ehtiyoj hisoblagich: N birlik tayyor mahsulot uchun qancha xom ashyo kerak (yo'qotish bilan), tanlangan omborda
 * bormi, qancha yetmaydi; tannarx huquqi bo'lsa — summa va 1 birlik tannarxi.
 */
export default function RequirementsCalc({ recipeId, unit, outputQty, branches, branchId, canReceive, canPurchase }: Props) {
  const d = useDict();
  const t = d.production.recipes;
  const units = d.stock.fields.units;
  const { pending, run } = useProdRun();
  const [qty, setQty] = useState(fmtQty(outputQty));
  const [branch, setBranch] = useState(branchId);
  const [res, setRes] = useState<Requirements | null>(null);

  const parsed = parseQty(qty, unit);

  function calc(e: React.FormEvent) {
    e.preventDefault();
    if (parsed === null) return;
    run(() => recipeRequirementsAction({ recipeId, qty: parsed, branchId: branch }), {
      refresh: false,
      after: (data) => setRes(data),
    });
  }

  const showCost = !!res?.totals;
  const short = res ? res.lines.filter((l) => l.shortage > 0) : [];

  return (
    <section className="pr-card" aria-labelledby="pr-req-h">
      <div>
        <h2 className="pr-h" id="pr-req-h">{t.requirements}</h2>
        <p className="pr-hint">{t.calcHint} {t.calcUnsaved}</p>
      </div>
      <form className="pr-stack" onSubmit={calc} style={{ gap: 12 }}>
        <div className="pr-grid2">
          <label className="pr-field">
            <span>{t.calcQty}</span>
            <span className="pr-suffix">
              <input
                className="input"
                inputMode={isFractionalUnit(unit) ? 'decimal' : 'numeric'}
                value={qty}
                onChange={(e) => setQty(cleanQtyInput(e.target.value, unit))}
                aria-invalid={(qty !== '' && parsed === null) || undefined}
                disabled={pending}
              />
              <span>{unitName(unit, units)}</span>
            </span>
          </label>
          {branches.length > 1 && (
            <label className="pr-field">
              <span>{t.branch}</span>
              <select className="input" value={branch} onChange={(e) => setBranch(e.target.value)} disabled={pending}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <button type="submit" className="btn btn-tinted" disabled={pending || parsed === null}>{pending ? d.common.loading : t.calc}</button>
      </form>

      {res && (
        <div className="pr-stack" aria-live="polite" style={{ gap: 12 }}>
          {short.length === 0 ? (
            <p className="pr-req-ok">{t.reqOk}</p>
          ) : (
            <ShortageList
              title={tr(t.reqShort, { n: short.length })}
              rows={short.map((l) => ({ code: l.code, name: l.name, unit: l.unit, need: l.required, available: l.available }))}
              d={d}
              canReceive={canReceive}
              canPurchase={canPurchase}
            />
          )}

          <div className={`pr-lines pr-lines--req${showCost ? ' has-cost' : ''}`}>
            <div className="pr-lhead" aria-hidden="true">
              <span>{t.colMaterial}</span>
              <span className="pr-num">{t.colNeed}</span>
              <span className="pr-num">{t.colStock}</span>
              <span className="pr-num">{t.colShortage}</span>
              {showCost && <span className="pr-num">{t.colCost}</span>}
            </div>
            {res.lines.map((l) => (
              <div key={l.code} className={`pr-line${l.shortage > 0 ? ' is-warn' : ''}`}>
                <span className="pr-cell pr-cell--main">
                  <span className="pr-cell-main">
                    <b>{l.name}</b>
                    <small>{l.code}{l.lossPct ? ` · ${d.production.common.lossPct} ${fmtQty(l.lossPct)}` : ''}</small>
                  </span>
                </span>
                <span className="pr-cell pr-num">
                  <span className="pr-cell-l">{t.colNeed}</span>
                  <span className="pr-v">{qtyText(l.required, l.unit, units)}</span>
                </span>
                <span className="pr-cell pr-num">
                  <span className="pr-cell-l">{t.colStock}</span>
                  <span>{l.productId ? qtyText(l.available, l.unit, units) : t.notInStock}</span>
                </span>
                <span className="pr-cell pr-num">
                  <span className="pr-cell-l">{t.colShortage}</span>
                  <span className={l.shortage > 0 ? 'pr-v pr-v--over' : 'pr-muted'}>{l.shortage > 0 ? qtyText(l.shortage, l.unit, units) : '—'}</span>
                </span>
                {showCost && (
                  <span className="pr-cell pr-num">
                    <span className="pr-cell-l">{t.colCost}</span>
                    <span>{l.cost !== null ? fmtMoney(l.cost) : '—'}</span>
                  </span>
                )}
              </div>
            ))}
          </div>

          {res.totals && (
            <dl className="pr-kv">
              <div><dt>{d.production.reports.materials}</dt><dd>{fmtMoney(res.totals.materials)} {d.common.sum}</dd></div>
              <div><dt>{d.production.reports.labor}</dt><dd>{fmtMoney(res.totals.labor)} {d.common.sum}</dd></div>
              <div><dt>{d.production.reports.overhead}</dt><dd>{fmtMoney(res.totals.overhead)} {d.common.sum}</dd></div>
              <div className="is-total"><dt>{t.reqTotal}</dt><dd>{fmtMoney(res.totals.total)} {d.common.sum}</dd></div>
              <div><dt>{d.production.common.unitCost}</dt><dd>{fmtMoney(res.totals.perUnit)} {d.common.sum}</dd></div>
            </dl>
          )}
        </div>
      )}
    </section>
  );
}
