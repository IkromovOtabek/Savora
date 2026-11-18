import Link from 'next/link';
import type { Dict } from '@/lib/i18n/dict';
import type { ProductUnit } from '@/lib/businessTypes';
import { qtyWithUnit, tr } from '@/lib/i18n/fmt';
import { fmtQty } from '@/lib/qty';
import Icon from '@/components/icons/Icon';
import './stockSettings.css';

export interface LowStockItem { id: string; name: string; unit: ProductUnit | null; available: number; minStock: number }

/**
 * Ombor sahifasidagi ogohlantirish: minimal qoldiqdan kam tovarlar (birinchi bir nechtasi) + filtr havolasi
 * (?low=1) + kirim/buyurtmaga tez o'tish (huquq va modul bo'lsa). Ma'lumot — lib/production/catalog.ts → lowStockFilter.
 */
export default function LowStockBlock({
  d,
  count,
  items,
  active,
  showHref,
  allHref,
  canReceive,
  canOrder,
  prefillIds = [],
}: {
  d: Dict;
  count: number;
  items: LowStockItem[];
  /** Ro'yxat hozir shu filtr bilan */
  active: boolean;
  showHref: string;
  allHref: string;
  canReceive: boolean;
  canOrder: boolean;
  /** Kirim/xarid formasini oldindan to'ldirish uchun minimal qoldiqdan kam tovarlar id'lari (≤ 50) */
  prefillIds?: string[];
}) {
  const t = d.stock.minStockAlert;
  const units = d.stock.fields.units;
  if (count === 0 && !active) return null;
  const qs = prefillIds.length ? `?items=${prefillIds.join(',')}` : '';
  return (
    <section className="ss-alert" aria-label={t.label} role="status">
      <div className="ss-alert-top">
        <b><Icon name="alert" size={17} /> {active && count === 0 ? d.production.lowStock.empty : tr(t.title, { n: count })}</b>
        <div className="ss-alert-actions">
          {active
            ? <Link href={allHref} className="btn btn-white btn-sm">{t.all}</Link>
            : <Link href={showHref} className="btn btn-white btn-sm">{t.show}</Link>}
          {canReceive && <Link href={`/app/receipts/new${qs}`} className="btn btn-white btn-sm">{t.receipt}</Link>}
          {canOrder && <Link href={`/app/purchase-orders/new${qs}`} className="btn btn-white btn-sm">{t.order}</Link>}
        </div>
      </div>
      {active ? (
        <span className="sr-only">{t.filterOn}</span>
      ) : items.length > 0 && (
        <ul className="ss-alert-items">
          {items.map((p) => (
            <li key={p.id}>
              <Link href={`/app/products/${p.id}`}>
                {p.name}
                <small>{tr(t.item, { qty: qtyWithUnit(p.available, p.unit, units), min: fmtQty(p.minStock) })}</small>
              </Link>
            </li>
          ))}
          {count > items.length && <li><span className="ss-more">{tr(t.more, { n: count - items.length })}</span></li>}
        </ul>
      )}
    </section>
  );
}
