'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { revaluationAction, writeOffAction } from '@/app/actions/stockAdjust';
import { applyPercent } from '@/lib/stockAdjust';
import { fmtMoney } from '@/lib/format';
import { toast } from '@/lib/toast';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';

export interface AdjustProduct {
  id: string;
  name: string;
  code: string;
  salePrice: number;
  wholesalePrice?: number;
  tracked: boolean;
  available: number;
  /** Faqat kelish narxini ko'rish huquqi bo'lsa */
  purchasePrice?: number;
}

interface Line { id: string; price: string; wholesale: string; qty: string }
type Reason = 'defective' | 'lost' | 'expired' | 'other';

const MAX_RESULTS = 8;

function lineOf(p: AdjustProduct): Line {
  return { id: p.id, price: String(p.salePrice || ''), wholesale: p.wholesalePrice ? String(p.wholesalePrice) : '', qty: '1' };
}

export default function StockAdjustForm({ mode, products, initialIds = [] }: { mode: 'revaluation' | 'writeoff'; products: AdjustProduct[]; initialIds?: string[] }) {
  const d = useDict();
  const k = d.stock.adjust;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<Line[]>(() => initialIds.flatMap((id) => {
    const p = products.find((x) => x.id === id);
    return p ? [lineOf(p)] : [];
  }));
  const [pct, setPct] = useState('');
  const [reason, setReason] = useState<Reason>('defective');
  const [note, setNote] = useState('');

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const taken = new Set(lines.map((l) => l.id));
    return products.filter((p) => !taken.has(p.id) && (p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))).slice(0, MAX_RESULTS);
  }, [query, products, lines]);

  function add(p: AdjustProduct) {
    setLines((prev) => [...prev, lineOf(p)]);
    setQuery('');
  }
  function patch(i: number, part: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...part } : l)));
  }
  function applyPct() {
    const n = Number(pct.replace(',', '.'));
    if (!Number.isFinite(n) || n === 0) return;
    setLines((prev) => prev.map((l) => {
      const p = byId.get(l.id);
      return p ? { ...l, price: String(applyPercent(p.salePrice, n)), wholesale: p.wholesalePrice ? String(applyPercent(p.wholesalePrice, n)) : l.wholesale } : l;
    }));
  }

  const rows = lines.flatMap((l) => { const p = byId.get(l.id); return p ? [{ l, p }] : []; });
  const totalCost = rows.reduce((s, { l, p }) => s + (Number(l.qty) || 0) * (p.purchasePrice ?? 0), 0);
  const showCost = mode === 'writeoff' && products.some((p) => p.purchasePrice !== undefined);

  function submit() {
    if (!rows.length) return;
    start(async () => {
      const res = mode === 'revaluation'
        ? await (async () => {
            const changed = rows.filter(({ l, p }) => Number(l.price) !== p.salePrice || (Number(l.wholesale) || 0) !== (p.wholesalePrice ?? 0));
            if (!changed.length) return { error: k.noChange };
            return revaluationAction({
              lines: changed.map(({ l, p }) => ({ productId: p.id, newSalePrice: Number(l.price) || 0, newWholesalePrice: Number(l.wholesale) || 0 })),
              note: note.trim() || undefined,
            });
          })()
        : await writeOffAction({
            lines: rows.map(({ l, p }) => ({ productId: p.id, qty: p.tracked ? Number(l.qty) || 0 : 1 })),
            reason,
            note: note.trim() || undefined,
          });
      if (res?.success) {
        toast(res.success, 'success');
        setLines([]); setNote(''); setPct('');
        // ?ids= tozalanadi — sahifa yangilanganda hujjat qayta to'lmasin
        router.replace(mode === 'revaluation' ? '/app/revaluation' : '/app/write-off');
      } else if (res?.error) {
        toast(res.error, 'error');
      }
    });
  }

  return (
    <div className="sa-form">
      <div className="sa-search">
        <Icon name="search" size={18} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={k.searchPh} aria-label={k.searchPh} autoComplete="off"
          onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { e.preventDefault(); add(results[0]); } }} />
        {query.trim() !== '' && (
          <ul className="sa-results" role="listbox">
            {results.length === 0 ? <li className="sa-res-empty">{k.noResults}</li> : results.map((p) => (
              <li key={p.id}>
                <button type="button" className="sa-res" onClick={() => add(p)}>
                  <span><b>{p.name}</b><small>{p.code}</small></span>
                  <span className="sa-res-r"><b>{fmtMoney(p.salePrice)}</b><small>{k.colAvail}: {p.available}</small></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="sa-empty"><Icon name={mode === 'revaluation' ? 'trendingUp' : 'trash'} size={26} /><span>{k.empty}</span></div>
      ) : (
        <div className="table-wrap sa-table-wrap">
          <table className="data-table sa-table">
            <thead>
              <tr>
                <th>{k.colProduct}</th>
                {mode === 'revaluation' ? (
                  <>
                    <th className="num">{k.colOld}</th>
                    <th className="num">{k.colNew}</th>
                    <th className="num">{k.colWholesale}</th>
                  </>
                ) : (
                  <>
                    <th className="num">{k.colAvail}</th>
                    <th className="num">{k.colQty}</th>
                    {showCost && <th className="num">{k.colCost}</th>}
                  </>
                )}
                <th aria-label={k.remove} />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ l, p }, i) => {
                const newPrice = Number(l.price) || 0;
                const delta = p.salePrice > 0 ? Math.round(((newPrice - p.salePrice) / p.salePrice) * 100) : 0;
                return (
                  <tr key={l.id}>
                    <td><div className="cell-main">{p.name}</div><div className="cell-sub">{p.code}</div></td>
                    {mode === 'revaluation' ? (
                      <>
                        <td className="num">{fmtMoney(p.salePrice)}{p.wholesalePrice ? <div className="cell-sub">{fmtMoney(p.wholesalePrice)}</div> : null}</td>
                        <td className="num">
                          <input className="sa-num" inputMode="numeric" value={l.price} aria-label={`${k.colNew}: ${p.name}`} onChange={(e) => patch(i, { price: e.target.value.replace(/\D/g, '') })} />
                          {delta !== 0 && <div className={`sa-delta${delta > 0 ? ' is-up' : ' is-down'}`}>{delta > 0 ? '+' : ''}{delta}%</div>}
                        </td>
                        <td className="num"><input className="sa-num" inputMode="numeric" value={l.wholesale} placeholder="—" aria-label={`${k.colWholesale}: ${p.name}`} onChange={(e) => patch(i, { wholesale: e.target.value.replace(/\D/g, '') })} /></td>
                      </>
                    ) : (
                      <>
                        <td className="num">{p.available}</td>
                        <td className="num">
                          {p.tracked
                            ? <input className="sa-num sa-num--qty" inputMode="numeric" value={l.qty} aria-label={`${k.colQty}: ${p.name}`} onChange={(e) => patch(i, { qty: e.target.value.replace(/\D/g, '') })} />
                            : 1}
                        </td>
                        {showCost && <td className="num">{fmtMoney((Number(l.qty) || 0) * (p.purchasePrice ?? 0))}</td>}
                      </>
                    )}
                    <td className="cell-actions">
                      <button type="button" className="sa-del" onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))} aria-label={`${k.remove}: ${p.name}`}><Icon name="trash" size={16} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="sa-foot">
        {mode === 'revaluation' ? (
          <div className="sa-pct">
            <label htmlFor="sa-pct">{k.pctAll}</label>
            <input id="sa-pct" className="input" inputMode="decimal" value={pct} placeholder={k.pctHint} onChange={(e) => setPct(e.target.value.replace(/[^\d.,-]/g, ''))} />
            <button type="button" className="btn btn-ghost" onClick={applyPct} disabled={!rows.length || !pct}>{k.pctApply}</button>
          </div>
        ) : (
          <div className="sa-reason" role="radiogroup" aria-label={k.reason}>
            {(['defective', 'lost', 'expired', 'other'] as const).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={reason === r} className={reason === r ? 'is-on' : ''} onClick={() => setReason(r)}>{k.reasons[r]}</button>
            ))}
          </div>
        )}
        <input className="input sa-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={k.note} aria-label={k.note} maxLength={300} />
        {showCost && rows.length > 0 && <div className="sa-cost"><span>{k.totalCost}</span><b>{fmtMoney(totalCost)} {d.common.sum}</b></div>}
        <button type="button" className={`btn ${mode === 'writeoff' ? 'btn-danger-fill' : 'btn-primary'} btn-with-icon`} onClick={submit} disabled={!rows.length || pending}>
          <Icon name={mode === 'revaluation' ? 'check' : 'trash'} size={16} />
          {mode === 'revaluation' ? k.saveReval : k.saveWo}
        </button>
      </div>
    </div>
  );
}
