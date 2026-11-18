'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelMyOrderAction } from '@/app/actions/market';
import type { OrderView } from '@/lib/ecom/orders';
import { fmtMoney } from '@/lib/format';
import { fmtQty } from '@/lib/qty';
import { tr } from '@/lib/i18n/fmt';
import { useDict, useLocale } from '@/lib/i18n/client';
import { toast } from '@/lib/toast';

/** Xaridorning buyurtmalari: holat, tarkib, «yangi» holatida bekor qilish */
export default function MyOrders({ orders }: { orders: OrderView[] }) {
  const d = useDict();
  const t = d.ecom.market.orders;
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const when = (iso: string) => new Date(iso).toLocaleString(locale === 'ru' ? 'ru-RU' : 'uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="mk-orders">
      {orders.map((o) => (
        <article key={o.id} className="mk-order" aria-label={o.orderNo}>
          <div className="mk-order-head">
            <b>{o.orderNo}</b>
            <span className={`mk-st mk-st--${o.status}`}>{t.status[o.status]}</span>
            <time dateTime={o.createdAt}>{when(o.createdAt)}</time>
          </div>
          <span className="mk-muted">{o.shopName} · {o.delivery === 'delivery' ? d.ecom.market.checkout.delivery : d.ecom.market.checkout.pickup}</span>
          <ul>
            {o.items.map((i) => (
              <li key={i.listingId}><span>{i.name} × {fmtQty(i.qty)}</span><b className="t-num">{fmtMoney(i.total)}</b></li>
            ))}
          </ul>
          <div className="mk-sum-row"><span>{d.ecom.market.cart.total}</span><b style={{ fontSize: 17 }}>{fmtMoney(o.total)} {d.common.sum}</b></div>
          {o.reason && <span className="mk-muted">{tr(t.reason, { reason: o.reason })}</span>}
          {o.status === 'new' && (
            <div>
              <button
                type="button"
                className="mk-btn mk-btn--ghost"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(t.cancelConfirm)) return;
                  start(async () => {
                    const r = await cancelMyOrderAction(o.id);
                    toast(r.message, r.ok ? 'success' : 'error');
                    router.refresh();
                  });
                }}
              >
                {t.cancel}
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
