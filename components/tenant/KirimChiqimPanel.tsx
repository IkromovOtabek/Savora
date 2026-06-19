'use client';

import { fmtMoney } from '@/lib/format';
import type { FlowLine, FlowTotals } from '@/lib/inventoryFlow';

function FlowTable({ title, lines, emptyText }: { title: string; lines: FlowLine[]; emptyText: string }) {
  return (
    <div className="panel">
      <div className="panel-head"><h2>{title}</h2></div>
      {lines.length === 0 ? (
        <div className="panel-empty"><p>{emptyText}</p></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table data-table--simple">
            <thead>
              <tr>
                <th>ID</th>
                <th>Mahsulot</th>
                <th>Filial</th>
                <th>Son</th>
                <th>Kelish</th>
                <th>Sotuv</th>
                <th>Foyda</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td><code>{l.productId}</code></td>
                  <td>{l.name}</td>
                  <td>{l.branchName}</td>
                  <td>{l.qty} ta</td>
                  <td>{fmtMoney(l.cost)}</td>
                  <td>{fmtMoney(l.revenue)}</td>
                  <td className={l.profit >= 0 ? 'text-ok' : 'text-warn'}>{fmtMoney(l.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
  return (
    <>
      <div className="dash-stats" style={{ marginBottom: 20 }}>
        <div className="dash-stat">
          <div className="dash-stat-n">{totals.stockCount} ta</div>
          <div className="dash-stat-l">Omborda (chiqim qiymati)</div>
        </div>
        <div className="dash-stat dash-stat--ok">
          <div className="dash-stat-n">{totals.soldCount} ta</div>
          <div className="dash-stat-l">Sotilgan (kirim)</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-n">{fmtMoney(totals.stockCost)}</div>
          <div className="dash-stat-l">Ombor qiymati</div>
        </div>
        <div className="dash-stat dash-stat--ok">
          <div className="dash-stat-n">{fmtMoney(totals.soldRevenue)}</div>
          <div className="dash-stat-l">Sotuv tushumi</div>
        </div>
        <div className="dash-stat dash-stat--ok">
          <div className="dash-stat-n">{fmtMoney(totals.profit)}</div>
          <div className="dash-stat-l">Foyda</div>
        </div>
      </div>

      <div className="two-col" style={{ alignItems: 'start' }}>
        <FlowTable title="Kirim (ombordagi)" lines={stockLines} emptyText="Omborda mahsulot yo&apos;q." />
        <FlowTable title="Chiqim (sotilgan)" lines={soldLines} emptyText="Sotilgan mahsulot yo&apos;q." />
      </div>
    </>
  );
}
