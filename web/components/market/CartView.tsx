'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons/Icon';
import { placeOrderAction, refreshCartAction } from '@/app/actions/market';
import { fmtMoney } from '@/lib/format';
import { tr } from '@/lib/i18n/fmt';
import { useDict } from '@/lib/i18n/client';
import { toast } from '@/lib/toast';
import { formatUzPhoneInput } from '@/lib/phone';
import { QtyStepper } from './AddToCart';
import { useCart, type CartItem } from './cart';

type Buyer = { name: string; phone: string; address?: string } | null;

/** Savat + rasmiylashtirish. Har do'kon — alohida buyurtma; to'lov topshirishda */
export default function CartView({ buyer }: { buyer: Buyer }) {
  const d = useDict();
  const t = d.ecom.market;
  const router = useRouter();
  const { items, ready, setQty, remove, clear, sync } = useCart();
  const [notice, setNotice] = useState('');
  const [delivery, setDelivery] = useState<'pickup' | 'delivery'>('pickup');
  const [address, setAddress] = useState(buyer?.address ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  // Ochilganda narx va qoldiqni server bilan moslash
  const ids = useMemo(() => items.map((x) => x.id).sort().join(','), [items]);
  const [synced, setSynced] = useState('');
  useEffect(() => {
    if (!ready || !ids || synced === ids) return;
    let alive = true;
    void refreshCartAction(ids.split(',')).then((cards) => {
      if (!alive) return;
      if (sync(cards)) setNotice(t.cart.changed);
      setSynced(ids);
    });
    return () => { alive = false; };
  }, [ready, ids, synced, sync, t.cart.changed]);

  const live = items.filter((x) => x.max > 0);
  const groups = useMemo(() => {
    const m = new Map<string, CartItem[]>();
    for (const x of items) m.set(x.shopSlug, [...(m.get(x.shopSlug) ?? []), x]);
    return [...m.values()];
  }, [items]);
  const total = live.reduce((s, x) => s + Math.round(x.price * x.qty), 0);

  // Buyurtma urinishi kaliti: savat o'zgarmaguncha bir xil — javob kelmay qayta bosilsa ikkinchi buyurtma ochilmaydi
  const sig = live.map((x) => `${x.id}:${x.qty}:${x.price}`).join('|');
  const attempt = useRef<{ sig: string; id: string } | null>(null);
  const clientIdFor = (s: string) => {
    if (attempt.current?.sig !== s) attempt.current = { sig: s, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}` };
    return attempt.current.id;
  };

  const place = () => start(async () => {
    setError('');
    const r = await placeOrderAction({
      lines: live.map((x) => ({ listingId: x.id, qty: x.qty, price: x.price })),
      delivery, address, note, clientId: clientIdFor(sig),
    });
    if (!r) return;
    if (r.ok) {
      attempt.current = null;
      // Ba'zi do'konga yuborilmagan bo'lsa — faqat yuborilganlarining tovarlari savatdan chiqadi
      if (r.failedShops.length) {
        for (const x of items) if (!r.failedShops.includes(x.shopSlug)) remove(x.id);
        setError(r.message);
        return;
      }
      clear();
      toast(r.message, 'success');
      router.push('/market/orders?placed=1');
      return;
    }
    setError(r.error);
    if (r.refresh) {
      const cards = await refreshCartAction(items.map((x) => x.id));
      sync(cards);
    }
  });

  if (!ready) return <div className="mk-empty">…</div>;
  if (items.length === 0) {
    return (
      <div className="mk-empty">
        <p>{t.cart.empty}</p>
        <Link href="/market" className="mk-btn">{t.cart.toCatalog}</Link>
      </div>
    );
  }

  return (
    <div className="mk-cart">
      <div>
        {notice && <p className="mk-alert mk-alert--info" style={{ marginTop: 0 }}>{notice}</p>}
        {groups.map((g) => (
          <section key={g[0].shopSlug} className="mk-shopgroup" aria-label={g[0].shopName}>
            <h2>
              <Link href={`/market/s/${g[0].shopSlug}`} style={{ color: 'inherit', textDecoration: 'none' }}>{g[0].shopName}</Link>
            </h2>
            {g.map((x) => (
              <div key={x.id} className={`mk-line${x.max > 0 ? '' : ' mk-line--off'}`}>
                <Link href={`/market/p/${x.id}`} className="mk-line-img" tabIndex={-1} aria-hidden>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {x.image ? <img src={x.image} alt="" /> : <Icon name="box" size={24} />}
                </Link>
                <div className="mk-line-main">
                  <Link href={`/market/p/${x.id}`}>{x.name}</Link>
                  <span className="mk-muted t-num" style={{ fontSize: 13 }}>{fmtMoney(x.price)} {d.common.sum}</span>
                  <div className="mk-line-ctl">
                    {x.max > 0
                      ? <QtyStepper value={x.qty} max={x.max} fractional={x.fractional} onChange={(v) => setQty(x.id, v)} />
                      : <span className="mk-alert" style={{ padding: '4px 10px' }}>{t.cart.unavailable}</span>}
                    <button type="button" className="mk-link-btn" onClick={() => remove(x.id)}>{t.cart.remove}</button>
                  </div>
                </div>
                <span className="mk-line-total">{fmtMoney(Math.round(x.price * x.qty))}</span>
              </div>
            ))}
          </section>
        ))}
      </div>

      <aside className="mk-panel mk-sum" aria-label={t.checkout.title}>
        <div className="mk-sum-row"><span>{t.cart.total}</span><b>{fmtMoney(total)} {d.common.sum}</b></div>
        {groups.length > 1 && <small className="mk-muted">{t.cart.perShop}</small>}
        <p className="mk-note" style={{ margin: 0 }}><Icon name="wallet" size={16} /> {t.payNote}</p>
        {buyer ? (
          <>
            <fieldset className="mk-opts" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="mk-muted" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t.checkout.how}</legend>
              {(['pickup', 'delivery'] as const).map((v) => (
                <label key={v} className={`mk-opt${delivery === v ? ' is-on' : ''}`}>
                  <input type="radio" name="delivery" checked={delivery === v} onChange={() => setDelivery(v)} />
                  {v === 'pickup' ? t.checkout.pickup : t.checkout.delivery}
                </label>
              ))}
            </fieldset>
            {delivery === 'delivery' && (
              <div className="mk-field">
                <label htmlFor="mk-addr">{t.checkout.address}</label>
                <textarea id="mk-addr" rows={2} maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t.checkout.addressPh} />
              </div>
            )}
            <div className="mk-field">
              <label htmlFor="mk-note">{t.checkout.note}</label>
              <input id="mk-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.checkout.notePh} />
              <small>{tr(t.checkout.contact, { phone: formatUzPhoneInput(buyer.phone) })}</small>
            </div>
            {error && <p className="mk-alert" role="alert" style={{ margin: 0 }}>{error}</p>}
            <button type="button" className="mk-btn mk-btn--lg mk-btn--block" disabled={pending || live.length === 0} onClick={place}>
              {pending ? t.checkout.placing : t.checkout.place}
            </button>
          </>
        ) : (
          <>
            <p className="mk-alert mk-alert--info" style={{ margin: 0 }}>{t.cart.loginToBuy}</p>
            <Link href="/market/login?next=/market/cart" className="mk-btn mk-btn--lg mk-btn--block">{t.auth.login}</Link>
            <Link href="/market/register?next=/market/cart" className="mk-btn mk-btn--lg mk-btn--block mk-btn--ghost">{t.auth.register}</Link>
          </>
        )}
      </aside>
    </div>
  );
}
