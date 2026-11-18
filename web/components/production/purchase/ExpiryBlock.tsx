import Link from 'next/link';
import type { Dict } from '@/lib/i18n/dict';
import type { ProductUnit } from '@/lib/businessTypes';
import { qtyWithUnit, tr } from '@/lib/i18n/fmt';
import Icon from '@/components/icons/Icon';
import './stockSettings.css';

export interface ExpiringStockItem { id: string; name: string; unit: ProductUnit | null; available: number; expiry: string; days: number }

/**
 * Ombor sahifasidagi ogohlantirish: yaroqlilik muddati `ShopSettings.stock.expiryWarnDays` kun ichida tugaydigan (yoki
 * o'tgan) tovarlar + filtr havolasi (?exp=1). Minimal qoldiq bloki (LowStockBlock) naqshi; ma'lumot —
 * lib/production/catalog.ts → expiringFilter (kunlik xabar ham shu filtr bilan — lib/production/lowStock.ts).
 */
export default function ExpiryBlock({ d, days, count, items, active, showHref, allHref }: {
  d: Dict;
  /** Ogohlantirish oynasi (kun) */
  days: number;
  count: number;
  items: ExpiringStockItem[];
  active: boolean;
  showHref: string;
  allHref: string;
}) {
  const t = d.production.expiry;
  const l = d.production.lowStock;
  const units = d.stock.fields.units;
  if (count === 0 && !active) return null;
  const when = (n: number) => (n < 0 ? tr(l.expPast, { n: -n }) : n === 0 ? l.expToday : tr(l.expDays, { n }));
  return (
    <section className="ss-alert ss-alert--exp" aria-label={t.label} role="status">
      <div className="ss-alert-top">
        <b><Icon name="alert" size={17} /> {active && count === 0 ? t.empty : tr(t.title, { n: count, days })}</b>
        <div className="ss-alert-actions">
          {active
            ? <Link href={allHref} className="btn btn-white btn-sm">{t.all}</Link>
            : <Link href={showHref} className="btn btn-white btn-sm">{t.show}</Link>}
        </div>
      </div>
      {active ? (
        <span className="sr-only">{t.filterOn}</span>
      ) : items.length > 0 && (
        <ul className="ss-alert-items">
          {items.map((p) => (
            <li key={p.id} className={p.days < 0 ? 'is-past' : undefined}>
              <Link href={`/app/products/${p.id}`}>
                {p.name}
                <small>{qtyWithUnit(p.available, p.unit, units)} · {tr(t.item, { date: p.expiry.split('-').reverse().join('.'), when: when(p.days) })}</small>
              </Link>
            </li>
          ))}
          {count > items.length && <li><span className="ss-more">{tr(t.more, { n: count - items.length })}</span></li>}
        </ul>
      )}
    </section>
  );
}
