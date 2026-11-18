'use client';

import Link from 'next/link';
import { useState } from 'react';
import Icon from '@/components/icons/Icon';
import type { ListingCard } from '@/lib/ecom/catalog';
import { fmtQty } from '@/lib/qty';
import { tr } from '@/lib/i18n/fmt';
import { useDict } from '@/lib/i18n/client';
import { toast } from '@/lib/toast';
import { useCart } from './cart';

/** Miqdor tanlagich (savat va mahsulot sahifasi) */
export function QtyStepper({ value, max, fractional, onChange }: { value: number; max: number; fractional: boolean; onChange: (v: number) => void }) {
  const t = useDict().ecom.market.cart;
  const step = fractional ? 0.1 : 1;
  const min = fractional ? 0.1 : 1;
  const fix = (n: number) => Math.round(n * 1000) / 1000;
  return (
    <span className="mk-qty">
      <button type="button" aria-label={t.dec} disabled={value <= min} onClick={() => onChange(fix(Math.max(min, value - step)))}>−</button>
      <input
        aria-label={t.qtyAria}
        inputMode={fractional ? 'decimal' : 'numeric'}
        value={fmtQty(value)}
        onChange={(e) => {
          const n = Number(e.target.value.replace(',', '.'));
          if (Number.isFinite(n) && n > 0) onChange(fix(Math.min(n, max)));
        }}
      />
      <button type="button" aria-label={t.inc} disabled={value >= max} onClick={() => onChange(fix(Math.min(max, value + step)))}>+</button>
    </span>
  );
}

/** Katalog kartochkasidagi tugma: savatga qo'shish yoki savatdagi miqdor */
export function CardAddButton({ card }: { card: ListingCard }) {
  const t = useDict().ecom.market;
  const { qtyOf, add, setQty, ready } = useCart();
  const inCart = ready ? qtyOf(card.id) : 0;
  if (inCart > 0) {
    return (
      <div className="mk-card-add">
        <QtyStepper value={inCart} max={card.qty} fractional={card.fractional} onChange={(v) => setQty(card.id, v)} />
      </div>
    );
  }
  return (
    <div className="mk-card-add">
      <button type="button" className="mk-btn mk-btn--soft mk-btn--block" onClick={() => { add(card, 1); toast(t.added, 'success'); }}>
        <Icon name="cart" size={16} /> {t.addToCart}
      </button>
    </div>
  );
}

/** Mahsulot sahifasidagi xarid bloki */
export function BuyBox({ card }: { card: ListingCard }) {
  const t = useDict().ecom.market;
  const { qtyOf, add, ready } = useCart();
  const [qty, setQty] = useState(1);
  const inCart = ready ? qtyOf(card.id) : 0;
  const room = Math.max(0, card.qty - inCart);
  return (
    <div className="mk-buy">
      {room > 0 && <QtyStepper value={Math.min(qty, room)} max={room} fractional={card.fractional} onChange={setQty} />}
      {room > 0 && (
        <button type="button" className="mk-btn mk-btn--lg" onClick={() => { add(card, Math.min(qty, room)); toast(t.added, 'success'); setQty(1); }}>
          <Icon name="cart" size={18} /> {t.addToCart}
        </button>
      )}
      {inCart > 0 && (
        <Link href="/market/cart" className="mk-btn mk-btn--lg mk-btn--ghost">
          {tr(t.inCart, { qty: fmtQty(inCart) })} · {t.goCart}
        </Link>
      )}
    </div>
  );
}
