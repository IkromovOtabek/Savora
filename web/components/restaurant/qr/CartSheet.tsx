'use client';

import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { MAX_QTY, lineTotal, optionNames, type CartLine, type MenuItem } from './cart';
import Stepper from './Stepper';

export type ServiceMode = 'none' | 'self' | 'yes' | 'maybe';

export interface CartSummary {
  subtotal: number;
  service: number;
  total: number;
  pct: number;
  mode: ServiceMode;
}

/** Savat: qatorlar (miqdor, olib tashlash), jami + xizmat haqi, «Buyurtma berish» va natija */
export default function CartSheet({
  lines,
  items,
  summary,
  money,
  placing,
  error,
  placedNo,
  onQty,
  onRemove,
  onPlace,
  onClose,
  onShowOrder,
}: {
  lines: CartLine[];
  items: ReadonlyMap<string, MenuItem>;
  summary: CartSummary;
  money: (n: number) => string;
  placing: boolean;
  error: string;
  /** Buyurtma qabul qilindi (raqami) — muvaffaqiyat ko'rinishi */
  placedNo: string | null;
  onQty: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
  onPlace: () => void;
  onClose: () => void;
  onShowOrder: () => void;
}) {
  const d = useDict();
  const q = d.restaurant.qrMenu;

  if (placedNo !== null) {
    return (
      <>
        <div className="qm-sheet-scroll">
          <div className="qm-success" role="status">
            <div className="qm-success-icon" aria-hidden><Icon name="check" size={32} strokeWidth={2.5} /></div>
            <h2 className="qm-sheet-title" id="qm-cart-title">{q.orderedTitle}</h2>
            {placedNo ? <p className="qm-order-no">{tr(d.restaurant.common.orderNo, { no: placedNo })}</p> : null}
            <p className="qm-success-text">{q.approvalHint}</p>
          </div>
        </div>
        <div className="qm-sheet-foot qm-foot-row">
          <button type="button" className="qm-btn qm-btn--ghost" onClick={onClose}>{d.common.close}</button>
          <button type="button" className="qm-btn qm-btn--brand" onClick={onShowOrder}>{q.showOrder}</button>
        </div>
      </>
    );
  }

  const serviceLabel = tr(d.restaurant.common.serviceChargeLine, { pct: summary.pct });

  return (
    <>
      <div className="qm-sheet-scroll">
        <div className="qm-sheet-head">
          <h2 className="qm-sheet-title" id="qm-cart-title">{q.cart}</h2>
          <button type="button" className="qm-close" onClick={onClose} aria-label={d.common.close}>
            <Icon name="close" size={20} />
          </button>
        </div>

        {!lines.length ? (
          <div className="qm-empty">
            <p className="qm-empty-title">{q.cartEmpty}</p>
            <p className="qm-hint">{q.cartEmptyHint}</p>
          </div>
        ) : (
          <ul className="qm-cart-list">
            {lines.map((l) => {
              const item = items.get(l.productId);
              if (!item) return null;
              const mods = optionNames(item, l.optionIds);
              return (
                <li className="qm-cart-line" key={l.key}>
                  <div className="qm-cart-info">
                    <p className="qm-cart-name">{item.name}</p>
                    {mods.length ? <p className="qm-cart-sub">{mods.join(', ')}</p> : null}
                    {l.note ? <p className="qm-cart-sub qm-cart-note">«{l.note}»</p> : null}
                  </div>
                  <p className="qm-cart-price">{money(lineTotal(item, l))}</p>
                  <div className="qm-cart-ctrl">
                    <button type="button" className="qm-link-danger" onClick={() => onRemove(l.key)}>{q.remove}</button>
                    <Stepper
                      small
                      value={l.qty}
                      min={1}
                      max={MAX_QTY}
                      onChange={(n) => onQty(l.key, n)}
                      onBelowMin={() => onRemove(l.key)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {lines.length ? (
          <div className="qm-summary">
            <div className="qm-row"><span>{q.subtotal}</span><span className="tnum">{money(summary.subtotal)}</span></div>
            {summary.mode === 'yes' || summary.mode === 'maybe' ? (
              <div className="qm-row">
                <span>
                  {serviceLabel}
                  {summary.mode === 'maybe' ? <small className="qm-row-note">{q.serviceMaybe}</small> : null}
                </span>
                <span className="tnum">{money(summary.service)}</span>
              </div>
            ) : null}
            {summary.mode === 'self' ? <p className="qm-hint">{q.noServiceCharge}</p> : null}
            <div className="qm-row qm-row--total"><span>{d.common.total}</span><span className="tnum">{money(summary.total)}</span></div>
          </div>
        ) : null}
      </div>

      {lines.length ? (
        <div className="qm-sheet-foot">
          {error ? <p className="qm-error" role="alert">{error}</p> : null}
          <button type="button" className="qm-btn qm-btn--brand" onClick={onPlace} disabled={placing} aria-busy={placing}>
            {placing ? q.placing : (
              <>
                <span>{q.placeOrder}</span>
                <span className="qm-btn-sum">{money(summary.total)}</span>
              </>
            )}
          </button>
          <p className="qm-hint qm-center">{q.approvalHint}</p>
        </div>
      ) : null}
    </>
  );
}
