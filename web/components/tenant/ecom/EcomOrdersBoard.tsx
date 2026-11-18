'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { shopOrderAction } from '@/app/actions/ecom';
import { toast } from '@/lib/toast';
import { formatUzPhoneInput } from '@/lib/phone';
import { resolvePublicFileUrl } from '@/lib/fileUrl';
import { fmtMoney } from '@/lib/format';
import { fmtQty } from '@/lib/qty';
import { tr } from '@/lib/i18n/fmt';
import { useDict, useLocale } from '@/lib/i18n/client';
import type { OrderView } from '@/lib/ecom/orders';

/** Onlayn buyurtmalar: qabul qilish, rad etish (sabab bilan), yakunlash (ombordan ayirish + sotuv) */
export default function EcomOrdersBoard({ orders }: { orders: OrderView[] }) {
  const d = useDict();
  const k = d.ecom.orders;
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const act = (id: string, action: 'accept' | 'reject' | 'complete', why?: string) => start(async () => {
    const r = await shopOrderAction(id, action, why);
    if (r?.error) toast(r.error, 'error');
    else if (r?.success) {
      toast(r.success, 'success');
      setRejecting(null);
      setReason('');
      router.refresh();
    }
  });

  const when = (iso: string) => new Date(iso).toLocaleString(locale === 'ru' ? 'ru-RU' : 'uz-UZ', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="ec-orders">
      {orders.map((o) => {
        const active = o.status === 'new' || o.status === 'accepted';
        return (
          <article key={o.id} className="ec-card ec-order" aria-label={o.orderNo}>
            <div className="ec-order-head">
              <b>{o.orderNo}</b>
              <span className={`ec-st ec-st--${o.status}`}>{k.status[o.status]}</span>
              <time dateTime={o.createdAt}>{when(o.createdAt)}</time>
            </div>
            <div className="ec-order-buyer">
              <span>{k.buyer}: <b>{o.buyerName}</b></span>
              {o.buyerPhone && <a href={`tel:${o.buyerPhone}`}>{formatUzPhoneInput(o.buyerPhone)}</a>}
              <span>{o.delivery === 'delivery' ? k.delivery : k.pickup}</span>
            </div>
            <ul className="ec-order-items" aria-label={k.items}>
              {o.items.map((i) => (
                <li key={i.listingId}>
                  {i.image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={resolvePublicFileUrl(i.image)} alt="" />
                    : <span className="ec-oi-ph" aria-hidden />}
                  <span>{i.name} <span className="ec-muted">× {fmtQty(i.qty)}</span></span>
                  <b className="t-num">{fmtMoney(i.total)}</b>
                </li>
              ))}
            </ul>
            <div className="ec-order-total"><span>{k.total}</span><b className="t-num">{fmtMoney(o.total)} {d.common.sum}</b></div>
            {(o.address || o.note || o.reason) && (
              <div className="ec-order-meta">
                {o.address && <span>{k.address}: {o.address}</span>}
                {o.note && <span>{k.note}: {o.note}</span>}
                {o.reason && <span>{k.rejectReason}: {o.reason}</span>}
              </div>
            )}
            {active && (
              <div className="ec-order-acts">
                {rejecting === o.id ? (
                  <>
                    <textarea
                      aria-label={k.rejectReason}
                      placeholder={k.rejectPh}
                      value={reason}
                      maxLength={300}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => act(o.id, 'reject', reason)}>{k.confirm}</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRejecting(null)}>{k.cancel}</button>
                  </>
                ) : (
                  <>
                    {o.status === 'new' && (
                      <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => act(o.id, 'accept')}>{k.accept}</button>
                    )}
                    <button
                      type="button"
                      className={`btn btn-sm ${o.status === 'accepted' ? 'btn-primary' : 'btn-ghost'}`}
                      disabled={pending}
                      title={k.completeHint}
                      onClick={() => { if (window.confirm(k.confirmComplete)) act(o.id, 'complete'); }}
                    >
                      {k.complete}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => { setRejecting(o.id); setReason(''); }}>{k.reject}</button>
                  </>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
