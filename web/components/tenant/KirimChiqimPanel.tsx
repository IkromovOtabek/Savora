'use client';

import { useMemo, useState } from 'react';
import { fmtMoney } from '@/lib/format';
import type { FlowLine, FlowTotals } from '@/lib/inventoryFlow';
import Icon from '@/components/icons/Icon';
import { FlowSplit } from '@/components/tenant/KirimChiqimCards';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/finance.css';

type Tab = 'stock' | 'sold';

function FlowTable({ lines, kind }: { lines: FlowLine[]; kind: Tab }) {
  const d = useDict();
  const k = d.sales.kirimChiqim;
  const saleLabel = kind === 'stock' ? k.expectedSale : d.common.sale;
  const profitLabel = kind === 'stock' ? k.expectedProfit : k.profit;
  const idLabel = kind === 'stock' ? 'ID' : k.saleNo;
  return (
    <div className="table-wrap">
      <table className="data-table fn-table">
        <thead>
          <tr>
            <th>{idLabel}</th>
            <th>{d.common.product}</th>
            <th>{d.common.branch}</th>
            <th className="fn-right">{k.qty}</th>
            <th className="fn-right">{k.cost}</th>
            <th className="fn-right">{saleLabel}</th>
            <th className="fn-right">{profitLabel}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td data-label={idLabel}><code className="fn-code">{l.productId}</code></td>
              <td data-label={d.common.product}><span className="cell-main">{l.name}</span></td>
              <td data-label={d.common.branch}>{l.branchName}</td>
              <td data-label={k.qty} className="fn-right">{tr(d.common.nPcs, { n: l.qty })}</td>
              <td data-label={k.cost} className="fn-right">{fmtMoney(l.cost)}</td>
              <td data-label={saleLabel} className="fn-right">{fmtMoney(l.revenue)}</td>
              <td data-label={profitLabel} className={`fn-right ${l.profit >= 0 ? 'fn-in' : 'fn-out'}`}>
                <strong>{fmtMoney(l.profit)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function KirimChiqimPanel({
  totals,
  stockLines,
  soldLines,
}: {
  totals: FlowTotals;
  stockLines: FlowLine[];
  soldLines: FlowLine[];
}) {
  const [tab, setTab] = useState<Tab>('sold');
  const [q, setQ] = useState('');
  const d = useDict();
  const k = d.sales.kirimChiqim;

  const lines = tab === 'stock' ? stockLines : soldLines;
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return lines;
    return lines.filter((l) =>
      l.name.toLowerCase().includes(term) || l.productId.toLowerCase().includes(term) || l.branchName.toLowerCase().includes(term),
    );
  }, [lines, q]);

  return (
    <div className="fn-page">
      <FlowSplit
        kirimValue={totals.stockCost}
        kirimCount={totals.stockCount}
        chiqimValue={totals.soldRevenue}
        chiqimCount={totals.soldCount}
        foyda={totals.profit}
      />

      <section className="fn-panel" aria-label={k.listAria}>
        <div className="fn-panel-head" style={{ flexWrap: 'wrap' }}>
          <div className="fn-seg" role="tablist" aria-label={k.listTypeAria} style={{ flex: '1 1 260px' }}>
            <button
              type="button" role="tab" id="kc-tab-sold" aria-controls="kc-panel"
              aria-selected={tab === 'sold'} className="fn-seg-btn" onClick={() => setTab('sold')}
            >
              {k.sold} <span className="fn-seg-count">{soldLines.length}</span>
            </button>
            <button
              type="button" role="tab" id="kc-tab-stock" aria-controls="kc-panel"
              aria-selected={tab === 'stock'} className="fn-seg-btn" onClick={() => setTab('stock')}
            >
              {k.inStock} <span className="fn-seg-count">{stockLines.length}</span>
            </button>
          </div>
          <div className="fn-search" style={{ flex: '1 1 220px', minHeight: 40 }}>
            <Icon name="search" size={16} />
            <label htmlFor="kc-filter" className="sr-only">{k.searchLabel}</label>
            <input
              id="kc-filter" type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={k.searchPh}
            />
          </div>
        </div>

        <div id="kc-panel" role="tabpanel" aria-labelledby={tab === 'stock' ? 'kc-tab-stock' : 'kc-tab-sold'}>
          {filtered.length === 0 ? (
            <div className="fn-empty">
              <span className="fn-empty-icon"><Icon name={tab === 'stock' ? 'box' : 'cart'} size={26} /></span>
              <strong>
                {q.trim() ? d.common.nothingFound : tab === 'stock' ? k.noStock : k.noSold}
              </strong>
              {q.trim() && <p>{k.tryOther}</p>}
            </div>
          ) : (
            <FlowTable lines={filtered} kind={tab} />
          )}
        </div>
      </section>
    </div>
  );
}
