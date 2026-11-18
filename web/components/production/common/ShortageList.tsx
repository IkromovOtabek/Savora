import Link from 'next/link';
import type { Dict } from '@/lib/i18n/dict';
import type { ProductUnit } from '@/lib/businessTypes';
import { roundQty } from '@/lib/qty';
import { qtyText } from './ui';

export interface ShortageRow {
  code: string;
  name: string;
  unit: ProductUnit | null;
  need: number;
  available: number;
}

/**
 * Xom ashyo yetishmovchiligi (`outOfStock` → `details.shortages`, ehtiyoj hisobi): nima, qancha kerak, omborda
 * qancha, qancha yetmaydi + «Kirim qilish» havolasi.
 */
export default function ShortageList({ rows, d, canReceive, canPurchase, title, hint }: {
  rows: readonly ShortageRow[];
  d: Dict;
  canReceive: boolean;
  canPurchase?: boolean;
  title: string;
  hint?: string;
}) {
  const t = d.production.orders;
  const units = d.stock.fields.units;
  return (
    <div className="pr-short" role="alert">
      <div className="pr-short-head">
        <b>{title}</b>
        {hint && <p className="pr-hint">{hint}</p>}
      </div>
      <ul className="pr-short-list">
        {rows.map((r) => (
          <li key={r.code}>
            <span className="pr-short-name">
              <b>{r.name}</b>
              <small>{r.code}</small>
            </span>
            <span className="pr-short-nums">
              <span><small>{t.colNeed}</small>{qtyText(r.need, r.unit, units)}</span>
              <span><small>{t.colStock}</small>{qtyText(r.available, r.unit, units)}</span>
              <span className="is-bad"><small>{t.colDeficit}</small>{qtyText(Math.max(0, roundQty(r.need - r.available)), r.unit, units)}</span>
            </span>
          </li>
        ))}
      </ul>
      {(canReceive || canPurchase) && (
        <div className="pr-actions">
          {canReceive && <Link href="/app/receipts" className="btn btn-sm btn-primary">{t.toReceipt}</Link>}
          {canPurchase && <Link href="/app/purchase-orders" className="btn btn-sm btn-ghost">{t.toPurchase}</Link>}
        </div>
      )}
    </div>
  );
}
