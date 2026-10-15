import Link from 'next/link';
import { fmtMoney } from '@/lib/format';
import type { BranchMonthFlow } from '@/lib/inventoryFlow';
import Icon from '@/components/icons/Icon';
import '@/components/tenant/styles/finance.css';

/**
 * Filiallar reytingi — har filialga BITTA izometrik (3D) ustun.
 * Ustun uzunligi = sotuv summasi; ichida ikki bo'lak: sotilgan mahsulot tannarxi + foyda.
 * (Sotuv = tannarx + foyda.) Omborga kirgan xarid — boshqa o'lchov, shuning uchun matnda.
 */
export default function MonitoringChart({ rows }: { rows: BranchMonthFlow[] }) {
  const ranked = [...rows].sort((a, b) => b.kirimSum - a.kirimSum);
  const hasSales = ranked.some((r) => r.kirimSum > 0);

  if (!hasSales) {
    return (
      <div className="ux-empty">
        <span className="ux-empty-ic"><Icon name="chart" size={26} /></span>
        <b>Bu oyda sotuv yo&apos;q</b>
        <p>Sotuv qo&apos;shilgach, filiallar shu yerda sotuv summasi bo&apos;yicha saflanadi.</p>
        <Link href="/app/sales/new" className="btn btn-tinted btn-sm">Sotuv qo&apos;shish</Link>
      </div>
    );
  }

  const maxVal = Math.max(1, ...ranked.map((r) => r.kirimSum));
  const pct = (v: number) => `${(Math.max(0, v) / maxVal) * 100}%`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="fn-chart-legend" aria-hidden="true">
        <span><i className="fn-dot-cost" /> Tannarx</span>
        <span><i className="fn-dot-profit" /> Foyda</span>
        <span>= Sotuv summa</span>
      </div>
      <ol className="fn-chart">
        {ranked.map((r, i) => {
          const profit = Math.max(0, r.profit);
          const cost = Math.max(0, r.kirimSum - profit);
          const desc = `Sotuv ${fmtMoney(r.kirimSum)} so'm: tannarx ${fmtMoney(cost)}, foyda ${fmtMoney(r.profit)}`;
          return (
            <li key={r.branchId} className="fn-chart-row">
              <span className="fn-chart-rank" aria-label={`${i + 1}-o'rin`}>{i + 1}</span>
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
                  <span>{r.kirimQty} ta sotildi</span>
                  <span className={r.profit >= 0 ? 'fn-in' : 'fn-out'}>
                    {r.profit >= 0 ? 'Foyda' : 'Zarar'}: {fmtMoney(Math.abs(r.profit))}
                  </span>
                  {r.chiqimQty > 0 && <span>Omborga kirdi: {r.chiqimQty} ta</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
