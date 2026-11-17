'use client';

import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import type { PublicOrderStatus } from '@/lib/restaurant/public';
import type { ItemStatus } from '@/lib/restaurant/types';

const TONE: Record<ItemStatus, string> = {
  pending: 'qm-chip--pending',
  new: 'qm-chip--progress',
  sent: 'qm-chip--progress',
  cooking: 'qm-chip--progress',
  ready: 'qm-chip--ready',
  served: '',
  voided: '',
};

/** «Buyurtmangiz»: stoldagi ochiq buyurtma taomlari va holatlari, to'lanadigan summa (polling QrMenuApp'da) */
export default function OrderStatus({
  status,
  money,
  refreshing,
  onRefresh,
}: {
  status: PublicOrderStatus;
  money: (n: number) => string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const d = useDict();
  const q = d.restaurant.qrMenu;
  const hasPending = status.items.some((i) => i.status === 'pending');

  return (
    <section className="qm-order" id="qm-order" aria-labelledby="qm-order-title" tabIndex={-1}>
      <div className="qm-order-head">
        <div>
          <h2 id="qm-order-title">{q.yourOrder}</h2>
          {status.orderNo ? <p className="qm-order-no">{tr(d.restaurant.common.orderNo, { no: status.orderNo })}</p> : null}
        </div>
        <button type="button" className="qm-icon-btn" onClick={onRefresh} disabled={refreshing} aria-label={q.refresh} title={q.refresh}>
          <Icon name="repeat" size={18} className={refreshing ? 'qm-spin' : ''} />
        </button>
      </div>

      <ul className="qm-order-list" aria-live="polite">
        {status.items.map((i, n) => (
          <li className="qm-order-row" key={`${n}-${i.name}`}>
            <span className="qm-order-name">{i.name} <span className="qm-order-qty">× {i.qty}</span></span>
            <span className="qm-order-sum tnum">{money(i.total)}</span>
            <span className={`qm-chip ${TONE[i.status]}`.trim()}>{q.statuses[i.status]}</span>
          </li>
        ))}
      </ul>

      {status.due > 0 || !hasPending ? (
        <div className="qm-summary qm-summary--flush">
          {status.serviceCharge > 0 ? (
            <div className="qm-row"><span>{q.serviceLine}</span><span className="tnum">{money(status.serviceCharge)}</span></div>
          ) : null}
          <div className="qm-row qm-row--total"><span>{q.due}</span><span className="tnum">{money(status.due)}</span></div>
        </div>
      ) : null}
      {hasPending ? <p className="qm-hint">{q.pendingHint}</p> : null}
    </section>
  );
}
