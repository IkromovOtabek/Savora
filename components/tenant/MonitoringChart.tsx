import { fmtMoney } from '@/lib/format';
import type { BranchMonthFlow } from '@/lib/inventoryFlow';

export default function MonitoringChart({ rows }: { rows: BranchMonthFlow[] }) {
  if (rows.length === 0) {
    return <p className="field-hint">Bu oy uchun ma&apos;lumot yo&apos;q.</p>;
  }

  const maxVal = Math.max(
    1,
    ...rows.flatMap((r) => [r.kirimQty, r.chiqimQty, r.profit]),
  );

  return (
    <div className="monitor-chart">
      {rows.map((r) => (
        <div key={r.branchId} className="monitor-chart-row">
          <div className="monitor-chart-label">{r.name}</div>
          <div className="monitor-chart-bars">
            <div className="monitor-bar-wrap" title={`Kirim: ${r.kirimQty} ta`}>
              <span className="monitor-bar-label">Kirim {r.kirimQty}</span>
              <div className="monitor-bar monitor-bar--in" style={{ width: `${(r.kirimQty / maxVal) * 100}%` }} />
            </div>
            <div className="monitor-bar-wrap" title={`Chiqim: ${r.chiqimQty} ta`}>
              <span className="monitor-bar-label">Chiqim {r.chiqimQty}</span>
              <div className="monitor-bar monitor-bar--out" style={{ width: `${(r.chiqimQty / maxVal) * 100}%` }} />
            </div>
            <div className="monitor-bar-wrap" title={`Foyda: ${fmtMoney(r.profit)}`}>
              <span className="monitor-bar-label">Foyda {fmtMoney(r.profit)}</span>
              <div className="monitor-bar monitor-bar--profit" style={{ width: `${(Math.max(0, r.profit) / maxVal) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
