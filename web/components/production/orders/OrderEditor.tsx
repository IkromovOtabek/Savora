'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import PriceInput from '@/components/ui/PriceInput';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import { fmtQty, isFractionalUnit, parseQty, priceTimesQty, roundQty } from '@/lib/qty';
import type { ProductUnit } from '@/lib/businessTypes';
import { PRODUCTION_LIMITS as L } from '@/lib/production/calc';
import type { LaborEdit, MaterialEdit, OrderView } from '@/lib/production/orders';
import { cancelProductionOrderAction, startProductionOrderAction, updateProductionOrderAction } from '@/app/actions/production';
import Dialog from '../common/Dialog';
import ProductPicker from '../common/ProductPicker';
import StatusPill from '../common/StatusPill';
import { useProdRun } from '../common/useProdRun';
import { cleanQtyInput, parseActualQty, parseSum, qtyText, signedQty, unitName, type PickedProduct } from '../common/ui';
import CompleteDialog from './CompleteDialog';

interface Extra {
  key: string;
  product: PickedProduct;
  qty: string;
}
interface LaborRow {
  key: string;
  operation: string;
  workerId: string | null;
  workerName: string | null;
  qty: string;
  rate: string;
}

interface Props {
  order: OrderView;
  canReceive: boolean;
  canPurchase: boolean;
}

let seq = 0;
const nextKey = () => `n${++seq}`;

const laborRowsOf = (o: OrderView): LaborRow[] =>
  o.labor.map((l) => ({ key: l.id, operation: l.operation, workerId: l.workerId, workerName: l.workerName, qty: fmtQty(l.qty), rate: String(l.rate) }));

/**
 * Ishlab chiqarish akti: sarlavha va holat tugmalari (`can` bo'yicha), reja, reja vs haqiqiy sarf (tuzatish,
 * qo'shimcha xom ashyo), ish haqi qatorlari, izoh, tannarx (`production.viewCost`), natija. Saqlash — bitta
 * `updateProductionOrderAction` (reja alohida: u xom ashyo qatorlarini qayta quradi).
 */
export default function OrderEditor({ order, canReceive, canPurchase }: Props) {
  const d = useDict();
  const t = d.production.orders;
  const c = d.production.common;
  const units = d.stock.fields.units;
  const { pending, run } = useProdRun();
  const can = order.can;
  const editable = can.edit;
  const unit = order.recipe.unit;
  const showCost = can.viewCost && order.status === 'done';

  const [plan, setPlan] = useState(fmtQty(order.plannedQty));
  const [actual, setActual] = useState<Record<string, string>>(() => Object.fromEntries(order.materials.map((m) => [m.id, fmtQty(m.actualQty)])));
  const [extras, setExtras] = useState<Extra[]>([]);
  const [labor, setLabor] = useState<LaborRow[]>(() => laborRowsOf(order));
  const [laborDirty, setLaborDirty] = useState(false);
  const [note, setNote] = useState(order.note ?? '');
  const [dialog, setDialog] = useState<'complete' | 'cancel' | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  /* ── o'zgarishlar ── */
  const matDirty = extras.length > 0 || order.materials.some((m) => actual[m.id] !== fmtQty(m.actualQty));
  const noteDirty = note.trim() !== (order.note ?? '').trim();
  const dirty = matDirty || laborDirty || noteDirty;

  const edits = useMemo((): { materials: MaterialEdit[]; labor?: LaborEdit[]; error: string | null } => {
    const materials: MaterialEdit[] = [];
    for (const m of order.materials) {
      const v = actual[m.id] ?? '';
      if (v === fmtQty(m.actualQty)) continue;
      const n = parseActualQty(v, m.unit);
      if (n === null) return { materials: [], error: tr(d.production.recipes.errQty, { name: m.name }) };
      if (n !== m.actualQty) materials.push({ id: m.id, actualQty: n });
    }
    for (const e of extras) {
      const n = parseActualQty(e.qty, e.product.unit);
      if (n === null || n === 0) return { materials: [], error: tr(d.production.recipes.errQty, { name: e.product.name }) };
      materials.push({ productId: e.product.id, actualQty: n });
    }
    if (!laborDirty) return { materials, error: null };
    const rows: LaborEdit[] = [];
    for (const l of labor) {
      const qty = parseActualQty(l.qty, 'kg');
      const rate = parseSum(l.rate);
      if (!l.operation.trim() || qty === null || rate === null) return { materials: [], error: d.production.recipes.errOp };
      rows.push({ operation: l.operation.trim(), qty, rate, ...(l.workerId ? { workerId: l.workerId } : {}) });
    }
    return { materials, labor: rows, error: null };
  }, [order.materials, actual, extras, labor, laborDirty, d]);

  // Saqlanmagan o'zgarish bilan sahifani yopishdan oldin ogohlantirish
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  function saveAll() {
    if (edits.error) return setMsg(edits.error);
    setMsg(null);
    run(() => updateProductionOrderAction(order.id, {
      ...(edits.materials.length ? { materials: edits.materials } : {}),
      ...(edits.labor ? { labor: edits.labor } : {}),
      ...(noteDirty ? { note: note.trim() } : {}),
    }), { onError: (e) => { setMsg(e.error); } });
  }

  const planned = parseQty(plan, unit);
  function savePlan() {
    if (planned === null || planned === order.plannedQty) return;
    if ((matDirty || laborDirty) && !window.confirm(t.planResetConfirm)) return;
    run(() => updateProductionOrderAction(order.id, { plannedQty: planned }));
  }

  /* ── qo'shimcha xom ashyo ── */
  const taken = useMemo(() => {
    const s = new Set<string>();
    for (const m of order.materials) {
      s.add(m.code);
      if (m.productId) s.add(m.productId);
    }
    for (const e of extras) s.add(e.product.id);
    return s;
  }, [order.materials, extras]);

  const laborTotal = labor.reduce((sum, l) => sum + priceTimesQty(parseSum(l.rate) ?? 0, parseActualQty(l.qty, 'kg') ?? 0), 0);
  const patchLabor = (k: string, part: Partial<LaborRow>) => {
    setLabor((prev) => prev.map((l) => (l.key === k ? { ...l, ...part } : l)));
    setLaborDirty(true);
  };

  const varianceOf = (plannedQty: number, v: string, u: ProductUnit | null, fallback: number) => {
    const n = parseActualQty(v, u);
    return roundQty((n ?? fallback) - plannedQty);
  };

  const active = order.status === 'draft' || order.status === 'in_progress';
  const metaLines = [
    order.docNo,
    tr(t.recipeLine, { name: order.recipe.name, v: order.recipe.version }),
    order.createdAt ? tr(t.createdLine, { date: fmtDateTime(order.createdAt), by: order.createdBy }) : '',
    order.startedAt ? tr(t.startedLine, { date: fmtDateTime(order.startedAt), by: order.startedBy ?? '—' }) : '',
    order.completedAt ? tr(t.completedLine, { date: fmtDateTime(order.completedAt), by: order.completedBy ?? '—' }) : '',
    order.cancelledAt ? tr(t.cancelledLine, { date: fmtDateTime(order.cancelledAt), by: order.cancelledBy ?? '—' }) : '',
    order.cancelReason ? tr(t.reasonLine, { reason: order.cancelReason }) : '',
  ].filter(Boolean);

  return (
    <>
      {/* ── Sarlavha ── */}
      <div className="pr-head">
        <div className="pr-head-t">
          <div className="pr-head-title">
            <h1>{order.recipe.outputName}</h1>
            <StatusPill status={order.status} d={d} />
          </div>
          <ul className="pr-head-meta">
            {metaLines.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
        <div className="pr-actions no-print">
          <Link href={`/app/production/${order.id}/print`} className="btn btn-ghost btn-with-icon">
            <Icon name="download" size={16} /> {t.print}
          </Link>
          {can.start && (
            <button type="button" className="btn btn-tinted" disabled={pending} onClick={() => run(() => startProductionOrderAction(order.id))}>
              {t.start}
            </button>
          )}
          {can.complete && (
            <button type="button" className="btn btn-accent btn-with-icon" disabled={pending} onClick={() => setDialog('complete')}>
              <Icon name="check" size={16} /> {t.complete}
            </button>
          )}
          {can.cancel && (
            <button type="button" className="btn btn-danger" disabled={pending} onClick={() => setDialog('cancel')}>
              {t.cancel}
            </button>
          )}
        </div>
      </div>

      {active && !editable && <p className="t-note t-note--info">{t.readOnly}</p>}

      <div className="pr-stats" style={{ marginBottom: 16 }}>
        <div className="pr-stat"><small>{c.planned}</small><b>{qtyText(order.plannedQty, unit, units)}</b></div>
        {order.producedQty !== null && <div className="pr-stat"><small>{c.produced}</small><b>{qtyText(order.producedQty, unit, units)}</b></div>}
        {!!order.scrapQty && <div className="pr-stat"><small>{c.scrap}</small><b>{qtyText(order.scrapQty, unit, units)}</b></div>}
        <div className="pr-stat"><small>{c.fromBranch}</small><b>{order.fromBranchName ?? '—'}</b></div>
        <div className="pr-stat"><small>{c.toBranch}</small><b>{order.toBranchName ?? '—'}</b></div>
      </div>

      <div className="pr-split">
        <div className="pr-stack">
          {/* ── Reja ── */}
          {editable && (
            <section className="pr-card" aria-labelledby="pr-oe-plan">
              <div>
                <h2 className="pr-h" id="pr-oe-plan">{t.plannedQty}</h2>
                <p className="pr-hint">{t.planHint}</p>
              </div>
              <div className="pr-search">
                <span className="pr-suffix" style={{ flex: 1 }}>
                  <input
                    className="input"
                    inputMode={isFractionalUnit(unit) ? 'decimal' : 'numeric'}
                    value={plan}
                    onChange={(e) => setPlan(cleanQtyInput(e.target.value, unit))}
                    aria-labelledby="pr-oe-plan"
                    aria-invalid={planned === null || undefined}
                    disabled={pending}
                  />
                  <span>{unitName(unit, units)}</span>
                </span>
                <button type="button" className="btn btn-ghost" onClick={savePlan} disabled={pending || planned === null || planned === order.plannedQty}>
                  {t.savePlan}
                </button>
              </div>
            </section>
          )}

          {/* ── Xom ashyo: reja vs haqiqiy ── */}
          <section className="pr-card" aria-labelledby="pr-oe-mat">
            <div>
              <h2 className="pr-h" id="pr-oe-mat">{t.materials}</h2>
              {editable && <p className="pr-hint">{t.materialsHint}</p>}
            </div>
            <div className={`pr-lines pr-lines--mat${showCost ? ' has-cost' : ''}`}>
              <div className="pr-lhead" aria-hidden="true">
                <span>{t.colMaterial}</span>
                <span className="pr-num">{c.planned}</span>
                <span className="pr-num">{c.actual}</span>
                <span className="pr-num">{t.colVariance}</span>
                {showCost && <span className="pr-num">{t.colUnitCost}</span>}
                {showCost && <span className="pr-num">{t.colCost}</span>}
              </div>
              {order.materials.map((m) => {
                const v = actual[m.id] ?? '';
                const bad = editable && parseActualQty(v, m.unit) === null;
                const variance = editable ? varianceOf(m.plannedQty, v, m.unit, m.actualQty) : m.variance;
                return (
                  <div key={m.id} className={`pr-line${!m.productId && active ? ' is-warn' : ''}`}>
                    <span className="pr-cell pr-cell--main">
                      <span className="pr-cell-main">
                        <b>{m.name}</b>
                        <small>
                          {m.code}
                          {m.extra ? ` · ${t.extra}` : ''}
                          {!m.productId && active ? ` · ${d.production.recipes.notInStock}` : ''}
                        </small>
                      </span>
                    </span>
                    <span className="pr-cell pr-num">
                      <span className="pr-cell-l">{c.planned}</span>
                      <span>{qtyText(m.plannedQty, m.unit, units)}</span>
                    </span>
                    <span className="pr-cell">
                      <span className="pr-cell-l">{c.actual}</span>
                      {editable ? (
                        <span className="pr-suffix">
                          <input
                            className="input pr-num"
                            inputMode={isFractionalUnit(m.unit) ? 'decimal' : 'numeric'}
                            value={v}
                            onChange={(e) => setActual((prev) => ({ ...prev, [m.id]: cleanQtyInput(e.target.value, m.unit) }))}
                            aria-label={`${c.actual}: ${m.name}`}
                            aria-invalid={bad || undefined}
                            disabled={pending}
                          />
                        </span>
                      ) : (
                        <span className="pr-num">{m.actualQty === 0 ? t.unused : qtyText(m.actualQty, m.unit, units)}</span>
                      )}
                    </span>
                    <span className="pr-cell pr-num">
                      <span className="pr-cell-l">{t.colVariance}</span>
                      <span className={`pr-v${variance > 0 ? ' pr-v--over' : variance < 0 ? ' pr-v--under' : ''}`}>{signedQty(variance)}</span>
                    </span>
                    {showCost && (
                      <span className="pr-cell pr-num">
                        <span className="pr-cell-l">{t.colUnitCost}</span>
                        <span>{m.unitCost !== null ? fmtMoney(m.unitCost) : '—'}</span>
                      </span>
                    )}
                    {showCost && (
                      <span className="pr-cell pr-num">
                        <span className="pr-cell-l">{t.colCost}</span>
                        <span>{m.cost !== null ? fmtMoney(m.cost) : '—'}</span>
                      </span>
                    )}
                  </div>
                );
              })}
              {extras.map((e) => (
                <div key={e.key} className="pr-line">
                  <span className="pr-cell pr-cell--main">
                    <span className="pr-cell-main">
                      <b>{e.product.name}</b>
                      <small>{e.product.code} · {t.extra}</small>
                    </span>
                  </span>
                  <span className="pr-cell pr-num">
                    <span className="pr-cell-l">{c.planned}</span>
                    <span>{qtyText(0, e.product.unit, units)}</span>
                  </span>
                  <span className="pr-cell">
                    <span className="pr-cell-l">{c.actual}</span>
                    <input
                      className="input pr-num"
                      inputMode={isFractionalUnit(e.product.unit) ? 'decimal' : 'numeric'}
                      value={e.qty}
                      onChange={(ev) => setExtras((prev) => prev.map((x) => (x.key === e.key ? { ...x, qty: cleanQtyInput(ev.target.value, e.product.unit) } : x)))}
                      aria-label={`${c.actual}: ${e.product.name}`}
                      placeholder="0"
                      disabled={pending}
                      autoFocus
                    />
                  </span>
                  <span className="pr-cell pr-cell-act">
                    <button type="button" className="icon-btn icon-btn--danger" onClick={() => setExtras((prev) => prev.filter((x) => x.key !== e.key))} aria-label={`${d.production.recipes.remove}: ${e.product.name}`} title={d.production.recipes.remove} disabled={pending}>
                      <Icon name="trash" size={16} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
            {editable && order.materials.length + extras.length < L.maxLines && (
              <ProductPicker
                branchId={order.fromBranchId}
                placeholder={t.addMaterialPh}
                exclude={taken}
                disabled={pending}
                onPick={(p) => setExtras((prev) => [...prev, { key: nextKey(), product: p, qty: '' }])}
              />
            )}
          </section>

          {/* ── Ish haqi ── */}
          <section className="pr-card" aria-labelledby="pr-oe-lab">
            <div className="pr-card-head">
              <div>
                <h2 className="pr-h" id="pr-oe-lab">{t.labor}</h2>
                {editable && <p className="pr-hint">{t.laborHint}</p>}
              </div>
              {order.laborManual && <span className="pr-tag pr-tag--warn">{t.laborManual}</span>}
            </div>
            {labor.length === 0 ? (
              <p className="pr-empty">{t.laborEmpty}</p>
            ) : (
              <div className="pr-lines pr-lines--labor">
                <div className="pr-lhead" aria-hidden="true">
                  <span>{c.operation}</span>
                  <span className="pr-num">{d.production.recipes.colQty}</span>
                  <span className="pr-num">{t.colRate}</span>
                  <span className="pr-num">{t.colAmount}</span>
                  <span />
                </div>
                {labor.map((l, idx) => {
                  const amount = priceTimesQty(parseSum(l.rate) ?? 0, parseActualQty(l.qty, 'kg') ?? 0);
                  return (
                    <div key={l.key} className="pr-line">
                      <span className="pr-cell pr-cell--main">
                        {editable ? (
                          <label className="pr-cell">
                            <span className="pr-cell-l">{c.operation}</span>
                            <input className="input" value={l.operation} onChange={(e) => patchLabor(l.key, { operation: e.target.value })} maxLength={80} aria-label={`${c.operation} ${idx + 1}`} disabled={pending} />
                          </label>
                        ) : (
                          <span className="pr-cell-main"><b>{l.operation}</b></span>
                        )}
                        {l.workerName && <small className="pr-muted">{c.worker}: {l.workerName}</small>}
                      </span>
                      <label className="pr-cell">
                        <span className="pr-cell-l">{d.production.recipes.colQty}</span>
                        {editable ? (
                          <input className="input pr-num" inputMode="decimal" value={l.qty} onChange={(e) => patchLabor(l.key, { qty: cleanQtyInput(e.target.value, null, { fractional: true }) })} aria-label={`${d.production.recipes.colQty}: ${l.operation || idx + 1}`} disabled={pending} />
                        ) : (
                          <span className="pr-num">{l.qty}</span>
                        )}
                      </label>
                      <label className="pr-cell">
                        <span className="pr-cell-l">{t.colRate}</span>
                        {editable ? (
                          <PriceInput className="input pr-num" value={l.rate} onValueChange={(v) => patchLabor(l.key, { rate: v })} ariaLabel={`${t.colRate}: ${l.operation || idx + 1}`} disabled={pending} />
                        ) : (
                          <span className="pr-num">{fmtMoney(parseSum(l.rate) ?? 0)}</span>
                        )}
                      </label>
                      <span className="pr-cell pr-num">
                        <span className="pr-cell-l">{t.colAmount}</span>
                        <span className="pr-v">{fmtMoney(amount)}</span>
                      </span>
                      <span className="pr-cell-act">
                        {editable && (
                          <button
                            type="button"
                            className="icon-btn icon-btn--danger"
                            onClick={() => {
                              setLabor((prev) => prev.filter((x) => x.key !== l.key));
                              setLaborDirty(true);
                            }}
                            aria-label={`${d.production.recipes.remove}: ${l.operation || idx + 1}`}
                            title={d.production.recipes.remove}
                            disabled={pending}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
                <div className="pr-lfoot">
                  <span>{t.laborTotal}</span>
                  <span />
                  <span />
                  <span className="pr-num">{fmtMoney(laborTotal)} {d.common.sum}</span>
                </div>
              </div>
            )}
            {editable && labor.length < L.maxLines && (
              <button
                type="button"
                className="btn btn-tinted btn-sm btn-with-icon"
                style={{ justifySelf: 'start' }}
                onClick={() => {
                  setLabor((prev) => [...prev, { key: nextKey(), operation: '', workerId: null, workerName: null, qty: fmtQty(order.plannedQty), rate: '' }]);
                  setLaborDirty(true);
                }}
                disabled={pending}
              >
                <Icon name="plus" size={15} /> {t.addLabor}
              </button>
            )}
          </section>
        </div>

        <aside className="pr-side">
          {/* ── Tannarx ── */}
          {can.viewCost && order.status !== 'cancelled' && (
            <section className="pr-card" aria-labelledby="pr-oe-cost">
              <h2 className="pr-h" id="pr-oe-cost">{t.costTitle}</h2>
              {order.cost ? (
                <dl className="pr-kv">
                  <div><dt>{d.production.reports.materials}</dt><dd>{fmtMoney(order.cost.materials)} {d.common.sum}</dd></div>
                  <div><dt>{d.production.reports.labor}</dt><dd>{fmtMoney(order.cost.labor)} {d.common.sum}</dd></div>
                  <div><dt>{d.production.reports.overhead}</dt><dd>{fmtMoney(order.cost.overhead)} {d.common.sum}</dd></div>
                  <div className="is-total"><dt>{c.total}</dt><dd>{fmtMoney(order.cost.total)} {d.common.sum}</dd></div>
                  <div className="is-total"><dt>{t.costUnit}</dt><dd>{fmtMoney(order.cost.unitCost)} {d.common.sum}</dd></div>
                  {order.cost.scrap > 0 && <div className="is-bad"><dt>{t.costScrap}</dt><dd>{fmtMoney(order.cost.scrap)} {d.common.sum}</dd></div>}
                </dl>
              ) : (
                <p className="pr-hint">{t.costPending}</p>
              )}
            </section>
          )}

          {/* ── Natija ── */}
          {order.status === 'done' && (order.outputProductId || order.scrapDocNo) && (
            <section className="pr-card" aria-labelledby="pr-oe-res">
              <h2 className="pr-h" id="pr-oe-res">{t.resultTitle}</h2>
              {order.scrapDocNo && <p className="pr-hint">{tr(t.scrapDoc, { no: order.scrapDocNo })}</p>}
              {order.outputProductId && (
                <Link href={`/app/products/${order.outputProductId}`} className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }}>{t.outputCard}</Link>
              )}
            </section>
          )}

          {/* ── Izoh ── */}
          <section className="pr-card" aria-labelledby="pr-oe-note">
            <h2 className="pr-h" id="pr-oe-note">{c.note}</h2>
            {editable ? (
              <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={L.noteMax} aria-labelledby="pr-oe-note" disabled={pending} />
            ) : order.note ? (
              <p className="pr-note-text">{order.note}</p>
            ) : (
              <p className="pr-hint">—</p>
            )}
          </section>
        </aside>
      </div>

      {/* ── Saqlash paneli ── */}
      {editable && dirty && (
        <div className="pr-savebar" role="region" aria-label={t.unsaved}>
          <span className="pr-unsaved">{t.unsaved}</span>
          {msg && <p className="pr-error" role="alert">{msg}</p>}
          <div className="pr-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() => {
                setActual(Object.fromEntries(order.materials.map((m) => [m.id, fmtQty(m.actualQty)])));
                setExtras([]);
                setLabor(laborRowsOf(order));
                setLaborDirty(false);
                setNote(order.note ?? '');
                setMsg(null);
              }}
            >
              {d.common.reset}
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={saveAll} disabled={pending}>
              {pending ? d.common.saving : d.common.save}
            </button>
          </div>
        </div>
      )}

      {can.complete && (
        <CompleteDialog
          order={order}
          open={dialog === 'complete'}
          onClose={() => setDialog(null)}
          pending={{ materials: edits.materials, labor: edits.labor, error: edits.error, dirty: matDirty || laborDirty }}
          canReceive={canReceive}
          canPurchase={canPurchase}
        />
      )}

      {can.cancel && (
        <Dialog open={dialog === 'cancel'} onClose={() => setDialog(null)} title={t.cancelTitle}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => cancelProductionOrderAction(order.id, { reason: reason.trim() }), { after: () => setDialog(null) });
            }}
          >
            <p className="pr-hint">{t.cancelHint}</p>
            <label className="pr-field">
              <span>{t.cancelReason}</span>
              <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} disabled={pending} autoFocus />
            </label>
            <div className="pr-actions pr-actions--end">
              <button type="button" className="btn btn-ghost" onClick={() => setDialog(null)} disabled={pending}>{t.keep}</button>
              <button type="submit" className="btn btn-danger-fill" disabled={pending}>{pending ? d.common.saving : t.cancelTitle}</button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
