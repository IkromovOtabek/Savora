import { fmtMoney } from '@/lib/format';
import type { BranchMonthFlow } from '@/lib/inventoryFlow';
import Icon from '@/components/icons/Icon';
import '@/components/tenant/styles/finance.css';

/**
 * Filiallar reytingi — sotuv summasi bo'yicha tartiblangan gorizontal ustunlar.
 * Barcha ustunlar bir xil o'lchovda (so'm): sotuv, xarid (omborga kirgan), foyda.
 * Avval dona va so'm bitta shkalada aralashib, dona ustunlari ko'rinmay qolardi.
 */
export default function MonitoringChart({ rows }: { rows: BranchMonthFlow[] }) {
  if (rows.length === 0) {
    return (
      <div className="fn-empty">
        <span className="fn-empty-icon"><Icon name="chart" size={26} /></span>
        <strong>Bu oy uchun ma&apos;lumot yo&apos;q</strong>
        <p>Boshqa oyni tanlab ko&apos;ring.</p>
      </div>
    );
  }

  const ranked = [...rows].sort((a, b) => b.kirimSum - a.kirimSum);
  const maxVal = Math.max(1, ...ranked.flatMap((r) => [r.kirimSum, r.chiqimSum, r.profit]));
  const w = (v: number) => `${(Math.max(0, v) / maxVal) * 100}%`;

  const bars = (r: BranchMonthFlow) => [
    { key: 'rev', cls: 'fn-bar--rev', label: 'Sotuv summa', value: r.kirimSum },
    { key: 'cost', cls: 'fn-bar--cost', label: 'Xarid summa', value: r.chiqimSum },
    { key: 'profit', cls: 'fn-bar--profit', label: 'Foyda', value: r.profit },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="fn-chart-legend" aria-hidden="true">
        <span><i className="fn-bar--rev" /> Sotuv summa</span>
        <span><i className="fn-bar--cost" /> Xarid summa (omborga kirgan)</span>
        <span><i className="fn-bar--profit" /> Foyda</span>
      </div>
      <ol className="fn-chart">
        {ranked.map((r, i) => (
          <li key={r.branchId} className="fn-chart-row">
            <span className="fn-chart-rank" aria-label={`${i + 1}-o'rin`}>{i + 1}</span>
            <div className="fn-chart-main">
              <div className="fn-chart-top">
                <span className="fn-chart-name">{r.name}</span>
                <span className="fn-chart-total">{fmtMoney(r.kirimSum)}</span>
              </div>
              <div className="fn-bars">
                {bars(r).map((b) => (
                  <div key={b.key} className="fn-bar-track" title={`${b.label}: ${fmtMoney(b.value)} so'm`}>
                    <span className={`fn-bar ${b.cls}`} style={{ width: w(b.value) }} />
                    <span className="fn-tip" aria-hidden="true">{b.label}: {fmtMoney(b.value)}</span>
                    <span className="sr-only">{b.label}: {fmtMoney(b.value)} so'm</span>
                  </div>
                ))}
              </div>
              <div className="fn-chart-meta">
                <span>Sotildi: {r.kirimQty} ta</span>
                <span>Omborga kirdi: {r.chiqimQty} ta</span>
                <span className={r.profit >= 0 ? 'fn-in' : 'fn-out'}>Foyda: {fmtMoney(r.profit)}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
