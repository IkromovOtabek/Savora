import type { OrderView } from '@/lib/restaurant/view';
import type { ShopSettings } from '@/lib/shopSettings';
import type { Dict } from '@/lib/i18n/server';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import { tr } from '@/lib/i18n/fmt';
import { fmtQty } from '@/lib/qty';

/**
 * Pre-chek («Hisob») qog'ozi — 80 mm termal (kenglik PrintReceiptButton'da). Fiskal chek EMAS:
 * `d.restaurant.common.precheckNote` yuqorida va pastda majburiy. Stol, ofitsant, mehmonlar, to'lanmagan
 * taomlar, xizmat haqi va qadoq qatorlari, oldin to'langan qism, jami. Mavjud chek uslubi (sl-rc-*).
 */
export default function PrecheckPaper({ order, org, receipt, logoUrl, d, printedAt }: {
  order: OrderView;
  org: { name: string; phone?: string };
  receipt: ShopSettings['receipt'];
  /** Restoran brendi logosi (sozlamadan, ixtiyoriy) */
  logoUrl?: string | null;
  d: Dict;
  printedAt: string;
}) {
  const c = d.restaurant.common;
  const k = d.restaurant.order;
  const b = order.bill;
  const items = order.items.filter((i) => i.status !== 'voided' && i.status !== 'pending' && !i.paid);

  return (
    <article className="sl-receipt-paper rt-precheck" aria-label={k.precheckTitle}>
      <header className="sl-rc-head">
        {logoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={logoUrl} alt="" className="rt-pc-logo" />
          : <span className="sl-rc-mark" aria-hidden>{org.name.trim().charAt(0).toUpperCase() || 'S'}</span>}
        <strong>{org.name}</strong>
        {receipt.headerNote && <span>{receipt.headerNote}</span>}
        {org.phone && <span>Tel: {org.phone}</span>}
        <span className="sl-rc-title">{k.precheckTitle}</span>
      </header>

      <p className="rt-pc-note">{c.precheckNote}</p>

      <hr className="sl-rc-cut" />

      <dl className="sl-rc-meta">
        <dt>{c.order}</dt><dd>{order.orderNo}</dd>
        {order.hallName ? (<><dt>{c.hall}</dt><dd>{order.hallName}</dd></>) : null}
        <dt>{c.table}</dt><dd>{order.tableNumber !== null ? order.tableNumber : c.orderTypes[order.type]}</dd>
        <dt>{c.waiter}</dt><dd>{order.waiterName ?? '—'}</dd>
        {order.guests ? (<><dt>{c.guests}</dt><dd>{order.guests}</dd></>) : null}
        <dt>{d.common.date}</dt><dd>{fmtDateTime(order.precheckAt ?? printedAt)}</dd>
      </dl>

      <hr className="sl-rc-cut" />

      <div className="sl-rc-items">
        {items.map((i) => (
          <div key={i.id} className="sl-rc-item">
            <div className="sl-rc-item-top">
              <b>{i.displayName}</b>
              <strong>{fmtMoney(i.total)}</strong>
            </div>
            <small>{fmtQty(i.qty)} × {fmtMoney(i.price)}</small>
            {i.note && <small>{i.note}</small>}
          </div>
        ))}
      </div>

      <hr className="sl-rc-cut" />

      <div className="sl-rc-line"><span>{k.subtotal}</span><span>{fmtMoney(b.dueSubtotal)} {d.common.sum}</span></div>
      {b.servicePct > 0 && (
        <div className="sl-rc-line"><span>{tr(c.serviceChargeLine, { pct: b.servicePct })}</span><span>{fmtMoney(b.dueServiceCharge)} {d.common.sum}</span></div>
      )}
      {b.duePackFee > 0 && (
        <div className="sl-rc-line"><span>{c.packFeeLine}</span><span>{fmtMoney(b.duePackFee)} {d.common.sum}</span></div>
      )}
      {b.paid > 0 && (
        <div className="sl-rc-line"><span>{k.paidBefore}</span><span>{fmtMoney(b.paid)} {d.common.sum}</span></div>
      )}

      <div className="sl-rc-total">
        <span>{k.due}</span>
        <strong>{fmtMoney(b.due)} {d.common.sum}</strong>
      </div>

      <hr className="sl-rc-cut" />

      <footer className="sl-rc-foot">
        <b className="rt-pc-note rt-pc-note--foot">{c.precheckNote}</b>
        <span className="sl-rc-code">{order.orderNo}</span>
      </footer>
    </article>
  );
}
