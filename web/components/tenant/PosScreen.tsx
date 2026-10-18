'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { posSaleAction } from '@/app/actions/pos';
import { DISCOUNT_PRESETS, allocateDiscount, discountAmount, unitPriceFor, type DiscountKind } from '@/lib/posCart';
import { fmtMoney } from '@/lib/format';
import { toast } from '@/lib/toast';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import './styles/pos.css';

export interface PosProduct {
  id: string;
  name: string;
  /** IMEI / shtrix-kod / mahsulot kodi — skaner va qidiruv uchun */
  codes: string[];
  salePrice: number;
  wholesalePrice?: number;
  tracked: boolean;
  available: number;
}

interface CartLine { id: string; qty: number; price: string }
interface ParkedSale {
  id: string;
  at: number;
  lines: CartLine[];
  wholesale: boolean;
  discountKind: DiscountKind;
  discountValue: string;
  customerName: string;
  customerPhone: string;
  note: string;
}

const MAX_RESULTS = 8;
const MAX_PARKED = 20;

function readParked(key: string): ParkedSale[] {
  try {
    const raw = localStorage.getItem(key);
    const list = raw ? (JSON.parse(raw) as ParkedSale[]) : [];
    return Array.isArray(list) ? list.slice(0, MAX_PARKED) : [];
  } catch {
    return [];
  }
}
function writeParked(key: string, list: ParkedSale[]) {
  try { localStorage.setItem(key, JSON.stringify(list.slice(0, MAX_PARKED))); } catch { /* xotira yo'q — kechiktirish shu sessiyada qoladi */ }
}

/** Matn maydonida yozilayotgan bo'lsa — klaviatura tugmalari ishlamaydi */
function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export default function PosScreen({ products, canDiscount, canEditPrice, noShift, storageKey }: {
  products: PosProduct[];
  canDiscount: boolean;
  canEditPrice: boolean;
  noShift: boolean;
  storageKey: string;
}) {
  const d = useDict();
  const k = d.sales.pos;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState('');
  const [hit, setHit] = useState(0);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [sel, setSel] = useState(-1);
  const [wholesale, setWholesale] = useState(false);
  const [discountKind, setDiscountKind] = useState<DiscountKind>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [note, setNote] = useState('');
  const [parked, setParked] = useState<ParkedSale[]>([]);
  const [showParked, setShowParked] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setParked(readParked(storageKey)); }, [storageKey]);
  useEffect(() => { searchRef.current?.focus(); }, []);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.codes.some((c) => c.toLowerCase().includes(q)))
      .slice(0, MAX_RESULTS);
  }, [query, products]);

  // Savatcha qatorlari — narx va jami (server bilan bir xil qoida)
  const rows = useMemo(() => cart.flatMap((line) => {
    const p = byId.get(line.id);
    if (!p) return [];
    const base = unitPriceFor(p, wholesale);
    const custom = Number(line.price) || 0;
    const needsPrice = base <= 0;
    const unit = needsPrice || (canEditPrice && custom > 0) ? custom : base;
    return [{ line, p, unit, needsPrice, isWholesale: wholesale && !!p.wholesalePrice, total: unit * line.qty }];
  }), [cart, byId, wholesale, canEditPrice]);

  const subtotal = rows.reduce((s, r) => s + r.total, 0);
  const discount = canDiscount ? discountAmount(subtotal, { kind: discountKind, value: Number(discountValue) || 0 }) : 0;
  const total = subtotal - discount;
  const missingPrice = rows.some((r) => r.unit <= 0);

  const add = useCallback((p: PosProduct) => {
    setCart((prev) => {
      const i = prev.findIndex((l) => l.id === p.id);
      if (i >= 0) {
        if (!p.tracked || prev[i].qty >= p.available) return prev; // dona mahsulot — bitta, qoldiqdan oshmaydi
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        setSel(i);
        return next;
      }
      setSel(prev.length);
      return [...prev, { id: p.id, qty: 1, price: '' }];
    });
    setQuery('');
    setHit(0);
  }, []);

  const changeQty = useCallback((i: number, delta: number) => {
    setCart((prev) => prev.flatMap((l, idx) => {
      if (idx !== i) return [l];
      const p = byId.get(l.id);
      const max = p?.tracked ? p.available : 1;
      const qty = Math.min(max, l.qty + delta);
      return qty <= 0 ? [] : [{ ...l, qty }];
    }));
  }, [byId]);

  const removeLine = useCallback((i: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== i));
    setSel((s) => Math.max(-1, Math.min(s, cart.length - 2)));
  }, [cart.length]);

  const resetSale = useCallback(() => {
    setCart([]); setSel(-1); setDiscountValue(''); setDiscountKind('percent');
    setCustomerName(''); setCustomerPhone(''); setNote(''); setWholesale(false);
  }, []);

  const pay = useCallback(() => {
    if (!cart.length || pending || missingPrice) return;
    startTransition(async () => {
      const res = await posSaleAction({
        lines: rows.map((r) => ({ productId: r.p.id, qty: r.line.qty, price: r.needsPrice || (canEditPrice && Number(r.line.price) > 0) ? r.unit : undefined })),
        wholesale,
        discount: { kind: discountKind, value: canDiscount ? Number(discountValue) || 0 : 0 },
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        note: note.trim() || undefined,
      });
      if (res?.success) {
        toast(res.success, 'success');
        resetSale();
        router.refresh();
        searchRef.current?.focus();
      } else if (res?.error) {
        toast(res.error, 'error');
      }
    });
  }, [cart.length, pending, missingPrice, rows, wholesale, discountKind, discountValue, canDiscount, canEditPrice, customerName, customerPhone, note, resetSale, router]);

  const park = useCallback(() => {
    if (!cart.length) return;
    const entry: ParkedSale = {
      id: `${Date.now()}`, at: Date.now(), lines: cart, wholesale, discountKind, discountValue, customerName, customerPhone, note,
    };
    const next = [entry, ...parked].slice(0, MAX_PARKED);
    setParked(next);
    writeParked(storageKey, next);
    resetSale();
    toast(k.parkedSaved, 'success');
    searchRef.current?.focus();
  }, [cart, wholesale, discountKind, discountValue, customerName, customerPhone, note, parked, storageKey, resetSale, k.parkedSaved]);

  const dropParked = useCallback((id: string) => {
    const next = parked.filter((x) => x.id !== id);
    setParked(next);
    writeParked(storageKey, next);
  }, [parked, storageKey]);

  const restoreParked = useCallback((x: ParkedSale) => {
    // Joriy savatcha bo'sh bo'lmasa — avval u ham kechiktiriladi (yo'qolmasin)
    const rest = parked.filter((p) => p.id !== x.id);
    const withCurrent = cart.length
      ? [{ id: `${Date.now()}`, at: Date.now(), lines: cart, wholesale, discountKind, discountValue, customerName, customerPhone, note }, ...rest]
      : rest;
    setParked(withCurrent);
    writeParked(storageKey, withCurrent);
    // Qoldig'i tugagan mahsulotlar savatchadan tushadi
    setCart(x.lines.filter((l) => byId.has(l.id)));
    setWholesale(x.wholesale); setDiscountKind(x.discountKind); setDiscountValue(x.discountValue);
    setCustomerName(x.customerName); setCustomerPhone(x.customerPhone); setNote(x.note);
    setSel(-1);
    setShowParked(false);
  }, [parked, cart, wholesale, discountKind, discountValue, customerName, customerPhone, note, storageKey, byId]);

  // Klaviatura: / qidiruv · J mijoz · K chegirma · L to'lash · O kechiktirish · ↑↓ qator · +/− son · Delete
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') { (document.activeElement as HTMLElement | null)?.blur(); setShowParked(false); return; }
      if (isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      else if (key === 'j') { e.preventDefault(); customerRef.current?.focus(); }
      else if (key === 'k' && canDiscount) { e.preventDefault(); discountRef.current?.focus(); }
      else if (key === 'l') { e.preventDefault(); pay(); }
      else if (key === 'o') { e.preventDefault(); park(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(cart.length - 1, s + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
      else if ((e.key === '+' || e.key === '=') && sel >= 0) { e.preventDefault(); changeQty(sel, 1); }
      else if (e.key === '-' && sel >= 0) { e.preventDefault(); changeQty(sel, -1); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel >= 0) { e.preventDefault(); removeLine(sel); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cart.length, sel, canDiscount, pay, park, changeQty, removeLine]);

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHit((h) => Math.min(results.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHit((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const q = query.trim().toLowerCase();
      // Skaner: kod aniq mos kelsa — darhol savatchaga
      const exact = products.find((p) => p.codes.some((c) => c.toLowerCase() === q));
      const pick = exact ?? results[hit];
      if (pick) add(pick);
    }
  }

  const lineDiscounts = allocateDiscount(rows.map((r) => r.total), discount);
  const kbd = (s: string) => <kbd className="pos-kbd" aria-hidden="true">{s}</kbd>;

  return (
    <div className="pos">
      <section className="pos-main" aria-label={k.cart}>
        <div className="pos-search">
          <Icon name="search" size={18} />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHit(0); }}
            onKeyDown={onSearchKey}
            placeholder={k.searchPh}
            aria-label={k.searchPh}
            autoComplete="off"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="pos-results"
          />
          {kbd('/')}
          {query.trim() !== '' && (
            <ul className="pos-results" id="pos-results" role="listbox">
              {results.length === 0 ? (
                <li className="pos-res-empty">{k.noResults}</li>
              ) : results.map((p, i) => (
                <li key={p.id} role="option" aria-selected={i === hit}>
                  <button type="button" className={`pos-res${i === hit ? ' is-hit' : ''}`} onMouseEnter={() => setHit(i)} onClick={() => add(p)}>
                    <span className="pos-res-name">{p.name}<small>{p.codes[0]}</small></span>
                    <span className="pos-res-meta">
                      <b>{fmtMoney(unitPriceFor(p, wholesale))}</b>
                      <small>{tr(k.left, { n: p.available })}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="pos-cart-head">
          <h1 className="pos-title">{k.cart} <span className="pos-count">{rows.length}</span></h1>
          <label className="pos-switch">
            <input type="checkbox" checked={wholesale} onChange={(e) => setWholesale(e.target.checked)} />
            <span className="pos-switch-ui" aria-hidden="true" />
            {k.wholesale}
          </label>
          <button type="button" className="btn btn-ghost btn-sm pos-parked-btn" onClick={() => setShowParked((v) => !v)} aria-expanded={showParked}>
            <Icon name="clock" size={15} />{k.parked}{parked.length > 0 && <b>{parked.length}</b>}
          </button>
        </div>

        {showParked && (
          <div className="pos-parked" role="region" aria-label={k.parked}>
            {parked.length === 0 ? <p className="pos-muted">{k.parkedEmpty}</p> : (
              <ul>
                {parked.map((x) => {
                  const sum = x.lines.reduce((s, l) => {
                    const p = byId.get(l.id);
                    return s + (p ? (unitPriceFor(p, x.wholesale) || Number(l.price) || 0) * l.qty : 0);
                  }, 0);
                  return (
                    <li key={x.id}>
                      <span>
                        <b>{x.customerName || new Date(x.at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}</b>
                        <small>{tr(k.parkedMeta, { n: x.lines.length, sum: fmtMoney(sum) })}</small>
                      </span>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => restoreParked(x)}>{k.restore}</button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => dropParked(x.id)} aria-label={k.remove}><Icon name="trash" size={14} /></button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="pos-muted pos-small">{k.parkedLocal}</p>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="pos-empty">
            <b>{k.emptyCart}</b>
            <span>{k.searchHint}</span>
          </div>
        ) : (
          <ul className="pos-cart">
            {rows.map((r, i) => (
              <li key={r.line.id} className={`pos-line${i === sel ? ' is-sel' : ''}`} onClick={() => setSel(i)}>
                <div className="pos-line-name">
                  <b>{r.p.name}</b>
                  <small>
                    {r.p.codes[0]}
                    {r.isWholesale && <span className="pos-tag">{k.wholesaleTag}</span>}
                  </small>
                </div>
                <div className="pos-qty">
                  <button type="button" onClick={() => changeQty(i, -1)} aria-label={k.qtyDec}>−</button>
                  <span aria-live="polite">{r.line.qty}</span>
                  <button type="button" onClick={() => changeQty(i, 1)} aria-label={k.qtyInc} disabled={!r.p.tracked || r.line.qty >= r.p.available}>+</button>
                </div>
                {r.needsPrice || canEditPrice ? (
                  <input
                    className="pos-price-input"
                    inputMode="numeric"
                    value={r.line.price}
                    placeholder={r.needsPrice ? k.priceNeeded : fmtMoney(r.unit)}
                    aria-label={`${k.price}: ${r.p.name}`}
                    onChange={(e) => setCart((prev) => prev.map((l, idx) => idx === i ? { ...l, price: e.target.value.replace(/\D/g, '') } : l))}
                  />
                ) : (
                  <span className="pos-unit">{fmtMoney(r.unit)}</span>
                )}
                <span className="pos-line-total">
                  {fmtMoney(r.total - (lineDiscounts[i] ?? 0))}
                  {lineDiscounts[i] > 0 && <s>{fmtMoney(r.total)}</s>}
                </span>
                <button type="button" className="pos-del" onClick={(e) => { e.stopPropagation(); removeLine(i); }} aria-label={k.remove}>
                  <Icon name="trash" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="pos-keys" aria-label={k.keysTitle}>
          <span>{kbd('↑')}{kbd('↓')} {k.keyNav}</span>
          <span>{kbd('+')}{kbd('−')} {k.keyQty}</span>
          <span>{kbd('Del')} {k.remove}</span>
        </div>
      </section>

      <aside className="pos-side">
        {noShift && (
          <Link href="/app/shifts" className="pos-warn">
            <Icon name="alert" size={16} />
            <span>{k.noShift}</span>
            <b>{k.openShift}</b>
          </Link>
        )}

        <div className="pos-card">
          <label className="pos-label" htmlFor="pos-customer">{k.customer} {kbd('J')}</label>
          <input id="pos-customer" ref={customerRef} className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={k.customerName} maxLength={100} autoComplete="off" />
          <input className="input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder={k.customerPhone} maxLength={30} inputMode="tel" autoComplete="off" aria-label={k.customerPhone} />
        </div>

        {canDiscount && (
          <div className="pos-card">
            <label className="pos-label" htmlFor="pos-discount">{k.discount} {kbd('K')}</label>
            <div className="pos-discount">
              <input id="pos-discount" ref={discountRef} className="input" inputMode="numeric" value={discountValue} onChange={(e) => setDiscountValue(e.target.value.replace(/\D/g, ''))} placeholder={k.discountPh} />
              <div className="pos-seg" role="group" aria-label={k.discount}>
                <button type="button" aria-pressed={discountKind === 'percent'} onClick={() => setDiscountKind('percent')}>%</button>
                <button type="button" aria-pressed={discountKind === 'amount'} onClick={() => setDiscountKind('amount')}>{d.common.sum}</button>
              </div>
            </div>
            <div className="pos-presets">
              {DISCOUNT_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={discountKind === 'percent' && discountValue === String(p)}
                  onClick={() => { setDiscountKind('percent'); setDiscountValue(discountKind === 'percent' && discountValue === String(p) ? '' : String(p)); }}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="pos-card">
          <label className="pos-label" htmlFor="pos-note">{k.note}</label>
          <input id="pos-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={k.notePh} maxLength={300} autoComplete="off" />
        </div>

        <div className="pos-pay">
          <div className="pos-sum"><span>{k.subtotal}</span><b>{fmtMoney(subtotal)} {d.common.sum}</b></div>
          {discount > 0 && <div className="pos-sum pos-sum--disc"><span>{k.discount}</span><b>− {fmtMoney(discount)} {d.common.sum}</b></div>}
          <button type="button" className="pos-pay-btn" onClick={pay} disabled={!rows.length || pending || missingPrice || total <= 0}>
            <span>{k.pay} {kbd('L')}</span>
            <b>{fmtMoney(total)} {d.common.sum}</b>
          </button>
          <span className="pos-muted pos-small pos-center">{k.cashOnly}</span>
          <button type="button" className="btn btn-ghost btn-full" onClick={park} disabled={!rows.length || pending}>
            {k.park} {kbd('O')}
          </button>
          <Link href="/app/sales/new" className="pos-other">{k.otherPayments}<Icon name="arrowRight" size={14} /></Link>
        </div>
      </aside>
    </div>
  );
}
