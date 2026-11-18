import Link from 'next/link';
import type { Dict } from '@/lib/i18n/dict';
import type { ProductOption } from '@/lib/production/catalog';
import { tr } from '@/lib/i18n/fmt';
import Icon from '@/components/icons/Icon';
import { qtyText, type BranchOption } from '../common/ui';

type LowItem = ProductOption & { branchId: string; shortage: number };

const MAX_ROWS = 8;

/**
 * Minimal qoldiqdan kam mahsulotlar (GET /api/production/low-stock bilan bir xil manba): eng ko'p yetmaydiganlari
 * birinchi; «Kirim qilish» / «Xarid buyurtmasi» havolalari — huquq bo'lsa.
 */
export default function LowStockCard({ items, branches, d, canReceive, canPurchase }: {
  items: LowItem[];
  branches: BranchOption[];
  d: Dict;
  canReceive: boolean;
  canPurchase: boolean;
}) {
  if (!items.length) return null;
  const t = d.production.orders;
  const units = d.stock.fields.units;
  const names = new Map(branches.map((b) => [b.id, b.name]));
  const showBranch = branches.length > 1;
  // Eng xavflisi (qoldiq / minimal nisbati eng kichigi) birinchi
  const ratio = (p: LowItem) => (p.minStock ? p.available / p.minStock : 1);
  const sorted = [...items].sort((a, b) => ratio(a) - ratio(b));
  const rows = sorted.slice(0, MAX_ROWS);
  // Kirim/xarid formasini shu tovarlar bilan oldindan to'ldirish (?items=…, bitta ombor bo'lsa — ?b=)
  const prefillIds = sorted.slice(0, 50).map((p) => p.id);
  const one = new Set(sorted.slice(0, 50).map((p) => p.branchId));
  const prefillQs = new URLSearchParams({ items: prefillIds.join(','), ...(one.size === 1 ? { b: [...one][0] } : {}) }).toString();

  return (
    <section className="pr-card" aria-labelledby="pr-low-h">
      <div className="pr-card-head">
        <div>
          <h2 className="pr-h" id="pr-low-h">
            <Icon name="alert" size={16} /> {d.production.lowStock.title}
          </h2>
          <p className="pr-hint">{t.lowStockSub}</p>
        </div>
        <span className="t-pill t-pill--bad">{items.length}</span>
      </div>
      <ul className="pr-low">
        {rows.map((p) => (
          <li key={p.id}>
            <span className="pr-low-t">
              <b>{p.name}</b>
              <small>{[p.code, showBranch ? names.get(p.branchId) : null].filter(Boolean).join(' · ')}</small>
            </span>
            <span className="pr-low-q">
              {tr(t.lowStockLine, { qty: qtyText(p.available, p.unit, units), min: qtyText(p.minStock ?? 0, p.unit, units) })}
            </span>
          </li>
        ))}
      </ul>
      {items.length > MAX_ROWS && <p className="pr-hint">{tr(d.production.lowStock.more, { n: items.length - MAX_ROWS })}</p>}
      {(canReceive || canPurchase) && (
        <div className="pr-actions">
          {canReceive && <Link href={`/app/receipts/new?${prefillQs}`} className="btn btn-sm btn-primary">{t.toReceipt}</Link>}
          {canPurchase && <Link href={`/app/purchase-orders/new?${prefillQs}`} className="btn btn-sm btn-ghost">{t.toPurchase}</Link>}
        </div>
      )}
    </section>
  );
}
