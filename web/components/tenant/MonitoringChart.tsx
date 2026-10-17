import Link from 'next/link';
import { fmtMoney } from '@/lib/format';
import type { BranchMonthFlow } from '@/lib/inventoryFlow';
import Icon from '@/components/icons/Icon';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/finance.css';

/**
 * Filiallar reytingi — har filialga BITTA izometrik (3D) ustun.
 * Ustun uzunligi = sotuv summasi; ichida ikki bo'lak: sotilgan mahsulot tannarxi + foyda.
 * (Sotuv = tannarx + foyda.) Omborga kirgan xarid — boshqa o'lchov, shuning uchun matnda.
 */
export default async function MonitoringChart({ rows }: { rows: BranchMonthFlow[] }) {
  const t = (await getDict()).shell.monitoring;
  const ranked = [...rows].sort((a, b) => b.kirimSum - a.kirimSum);
  const hasSales = ranked.some((r) => r.kirimSum > 0);

  if (!hasSales) {
    return (
      <div className="ux-empty">
        <span className="ux-empty-ic"><Icon name="chart" size={26} /></span>
        <b>{t.noSalesMonth}</b>
        <p>{t.noSalesMonthText}</p>
        <Link href="/app/sales/new" className="btn btn-tinted btn-sm">{t.addSale}</Link>
      </div>
    );
  }

  const maxVal = Math.max(1, ...ranked.map((r) => r.kirimSum));
  const pct = (v: number) => `${(Math.max(0, v) / maxVal) * 100}%`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="fn-chart-legend" aria-hidden="true">
        <span><i className="fn-dot-cost" /> {t.cost}</span>
        <span><i className="fn-dot-profit" /> {t.profit}</span>
        <span>{t.equalsSaleSum}</span>
      </div>
      <ol className="fn-chart">
        {ranked.map((r, i) => {
          const profit = Math.max(0, r.profit);
          const cost = Math.max(0, r.kirimSum - profit);
          const desc = tr(t.barDesc, { sum: fmtMoney(r.kirimSum), cost: fmtMoney(cost), profit: fmtMoney(r.profit) });
          return (
            <li key={r.branchId} className="fn-chart-row">
              <span className="fn-chart-rank" aria-label={tr(t.rank, { n: i + 1 })}>{i + 1}</span>
              <div className="fn-chart-main">
                <div className="fn-chart-top">
                  <span className="fn-chart-name">{r.name}</span>
                  <span className="fn-chart-total">{fmtMoney(r.kirimSum)}</span>
                </div>
                <div className="fn-iso" title={desc} aria-hidden="true">
                  {r.kirimSum > 0 && (
                    <div className="fn-iso-bar" style={{ width: pct(r.kirimSum) }}>
                      {cost > 0 && <span className="fn-iso-seg fn-iso-seg--cost" style={{ flex: `${cost} 1 0` }} />}
                      {profit > 0 && <span className="fn-iso-seg fn-iso-seg--profit" style={{ flex: `${profit} 1 0` }} />}
                    </div>
                  )}
                </div>
                <span className="sr-only">{desc}</span>
                <div className="fn-chart-meta">
                  <span>{tr(t.nSold, { n: r.kirimQty })}</span>
                  <span className={r.profit >= 0 ? 'fn-in' : 'fn-out'}>
                    {r.profit >= 0 ? t.profit : t.loss}: {fmtMoney(Math.abs(r.profit))}
                  </span>
                  {r.chiqimQty > 0 && <span>{tr(t.nIncoming, { n: r.chiqimQty })}</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
