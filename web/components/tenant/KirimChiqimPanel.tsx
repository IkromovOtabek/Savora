'use client';

import { useMemo, useState } from 'react';
import { fmtMoney } from '@/lib/format';
import type { FlowLine, FlowTotals } from '@/lib/inventoryFlow';
import Icon from '@/components/icons/Icon';
import { FlowSplit } from '@/components/tenant/KirimChiqimCards';
import '@/components/tenant/styles/finance.css';

type Tab = 'stock' | 'sold';

function FlowTable({ lines, kind }: { lines: FlowLine[]; kind: Tab }) {
  const saleLabel = kind === 'stock' ? 'Kutilgan sotuv' : 'Sotuv';
  const profitLabel = kind === 'stock' ? 'Kutilgan foyda' : 'Foyda';
  return (
    <div className="table-wrap">
      <table className="data-table fn-table">
        <thead>
          <tr>
            <th>{kind === 'stock' ? 'ID' : 'Sotuv №'}</th>
            <th>Mahsulot</th>
            <th>Filial</th>
            <th className="fn-right">Soni</th>
            <th className="fn-right">Tannarx</th>
            <th className="fn-right">{saleLabel}</th>
            <th className="fn-right">{profitLabel}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td data-label={kind === 'stock' ? 'ID' : 'Sotuv №'}><code className="fn-code">{l.productId}</code></td>
              <td data-label="Mahsulot"><span className="cell-main">{l.name}</span></td>
              <td data-label="Filial">{l.branchName}</td>
              <td data-label="Soni" className="fn-right">{l.qty} ta</td>
              <td data-label="Tannarx" className="fn-right">{fmtMoney(l.cost)}</td>
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

      <section className="fn-panel" aria-label="Mahsulotlar ro'yxati">
        <div className="fn-panel-head" style={{ flexWrap: 'wrap' }}>
          <div className="fn-seg" role="tablist" aria-label="Ro'yxat turi" style={{ flex: '1 1 260px' }}>
            <button
              type="button" role="tab" id="kc-tab-sold" aria-controls="kc-panel"
              aria-selected={tab === 'sold'} className="fn-seg-btn" onClick={() => setTab('sold')}
            >
              Sotilgan <span className="fn-seg-count">{soldLines.length}</span>
            </button>
            <button
              type="button" role="tab" id="kc-tab-stock" aria-controls="kc-panel"
              aria-selected={tab === 'stock'} className="fn-seg-btn" onClick={() => setTab('stock')}
            >
              Omborda <span className="fn-seg-count">{stockLines.length}</span>
            </button>
          </div>
          <div className="fn-search" style={{ flex: '1 1 220px', minHeight: 40 }}>
            <Icon name="search" size={16} />
            <label htmlFor="kc-filter" className="sr-only">Ro&apos;yxatdan izlash</label>
            <input
              id="kc-filter" type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Mahsulot, ID yoki filial"
            />
          </div>
        </div>

        <div id="kc-panel" role="tabpanel" aria-labelledby={tab === 'stock' ? 'kc-tab-stock' : 'kc-tab-sold'}>
          {filtered.length === 0 ? (
            <div className="fn-empty">
              <span className="fn-empty-icon"><Icon name={tab === 'stock' ? 'box' : 'cart'} size={26} /></span>
              <strong>
                {q.trim() ? 'Hech narsa topilmadi' : tab === 'stock' ? 'Omborda mahsulot yo\'q' : 'Sotilgan mahsulot yo\'q'}
              </strong>
              {q.trim() && <p>Boshqa so&apos;z bilan izlab ko&apos;ring.</p>}
            </div>
          ) : (
            <FlowTable lines={filtered} kind={tab} />
          )}
        </div>
      </section>
    </div>
  );
}
