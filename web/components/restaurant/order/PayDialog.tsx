'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Icon, { type IconName } from '@/components/icons/Icon';
import { fmtMoney } from '@/lib/format';
import { toast } from '@/lib/toast';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { PAY_METHODS, mergeParts, settlePayment, type PayMethod, type PayPart } from '@/lib/payMethods';
import { DISCOUNT_PRESETS, type CartDiscount, type DiscountKind } from '@/lib/posCart';
import { fmtQty, isFractionalUnit, parseQty, priceTimesQty } from '@/lib/qty';
import { computePartTotals, splitEqually } from '@/lib/restaurant/bill';
import type { OrderView } from '@/lib/restaurant/view';
import type { PayResult, SendFailure } from '@/lib/restaurant/ops';
import { payOrderAction } from '@/app/actions/restaurant';
import Modal, { QtyStepper } from './Modal';
import type { Runner } from './OrderDialogs';
import { isTyping, newClientId } from './shared';
import '@/components/tenant/styles/pos.css';

const METHOD_ICON: Record<PayMethod, IconName> = { cash: 'wallet', uzcard: 'plans', humo: 'plans', click: 'phone', payme: 'phone', uzqr: 'qr' };
/** Naqd: tez tanlov — summani shu kupyuraga yaxlitlash (kassa bilan bir xil) */
const NOTES = [1000, 5000, 10000, 50000, 100000, 200000];
const MAX_SHARES = 30;
type Mode = 'full' | 'items' | 'equal';

const num = (s: string) => Number(s.replace(/\D/g, '')) || 0;
const grouped = (s: string) => (s ? fmtMoney(num(s)) : '');

/**
 * Buyurtma to'lovi (payOrder): butun hisob, taomlar bo'yicha (hisobni bo'lish, miqdor bilan — order.split)
 * yoki teng bo'lish (splitEqually — bitta so'rovda har mehmon ulushi alohida `parts`). Usullar — kassadagi
 * PAY_METHODS (UzQR bilan), aralash to'lov, naqdda qaytim. Xizmat haqi, qadoq va chegirma qatorlari ochiq.
 * `payId` — takroriy bosish/tarmoq uzilishida ikki marta yozilmasin (oyna davomida bitta).
 */
export default function PayDialog({ order, busy, run, onClose, onFailed, shopName, backHref, onBack, backLabel }: {
  order: OrderView;
  busy: boolean;
  run: Runner;
  onClose: () => void;
  /** Yuborilmagan taom omborda yetmadi (sendFailed) — sabablar ro'yxati */
  onFailed: (f: SendFailure[]) => void;
  shopName: string;
  backHref: string;
  /** Hisob yopilgach asosiy tugma havola emas, amal bo'lsin (kassir oynasi — navbatga qaytish) */
  onBack?: () => void;
  /** Asosiy tugma yozuvi (standart — «Stollarga qaytish») */
  backLabel?: string;
}) {
  const d = useDict();
  const k = d.restaurant.order;
  const c = d.restaurant.common;
  const p = d.sales.pos;
  const can = order.can;

  const [mode, setMode] = useState<Mode>('full');
  const [sel, setSel] = useState<Record<string, number>>({});
  const [selText, setSelText] = useState<Record<string, string>>({});
  const [guests, setGuests] = useState(() => Math.min(MAX_SHARES, Math.max(2, order.guests ?? 2)));
  const [shareMethods, setShareMethods] = useState<PayMethod[]>([]);
  const [mixed, setMixed] = useState(false);
  const [tile, setTile] = useState<PayMethod>('cash');
  const [received, setReceived] = useState('');
  const [amounts, setAmounts] = useState<Partial<Record<PayMethod, string>>>({});
  const [discKind, setDiscKind] = useState<DiscountKind>('percent');
  const [discValue, setDiscValue] = useState('');
  const [payId, setPayId] = useState(() => newClientId('pay'));
  const [done, setDone] = useState<PayResult | null>(null);
  const [printKey, setPrintKey] = useState(0);

  const unpaid = useMemo(
    () => order.items.filter((i) => i.status !== 'voided' && i.status !== 'pending' && !i.paid),
    [order.items],
  );
  const pendingN = order.bill.counts.pending;
  const unsentN = order.bill.counts.unsent;
  const packFee = !order.packFeePaid && order.packFee > 0 ? order.packFee : 0;
  const servicePct = order.bill.servicePct;

  const lines = mode === 'items'
    ? unpaid.filter((i) => (sel[i.id] ?? 0) > 0).map((i) => ({ item: i, qty: Math.min(i.qty, sel[i.id]) }))
    : unpaid.map((i) => ({ item: i, qty: i.qty }));
  const discount: CartDiscount | null = can?.discount && Number(discValue) > 0 ? { kind: discKind, value: Number(discValue) } : null;
  // null — chegirma summadan katta yoki teng (server ham rad etadi)
  const totals = lines.length ? computePartTotals(lines.map((l) => ({ price: l.item.price, qty: l.qty })), { servicePct, packFee, discount }) : undefined;
  const total = totals?.total ?? 0;
  const shares = mode === 'equal' && total > 0 ? splitEqually(total, guests) : [];

  const parts: PayPart[] = mode === 'equal'
    ? shares.map((a, i) => ({ method: shareMethods[i] ?? 'cash', amount: a }))
    : mixed
      ? PAY_METHODS.map((m) => ({ method: m, amount: num(amounts[m] ?? '') }))
      : tile === 'cash'
        ? [{ method: 'cash', amount: received ? num(received) : total }]
        : [{ method: tile, amount: total }];
  const result = settlePayment(total, parts, 'full');
  const entered = parts.reduce((s, x) => s + x.amount, 0);
  const due = Math.max(0, total - entered);
  const canPay = !!can?.pay && pendingN === 0 && !!totals && total > 0 && result.ok && !busy;
  const errText = !result.ok && entered > 0 && totals ? p[result.reason] : null;

  async function pay() {
    if (!canPay) return;
    const items = mode === 'items'
      ? lines.map((l) => (l.qty < l.item.qty ? { itemId: l.item.id, qty: l.qty } : { itemId: l.item.id }))
      : undefined;
    const input = { items, parts: mergeParts(parts), discount, payId };
    const r = await run('pay', async () => {
      let res = await payOrderAction(order.id, input);
      // Shu payId bilan avvalgi so'rov hali yozilayotgan bo'lsa (qotib qolgandan keyin qayta bosish) server
      // `conflict` qaytaradi — biroz kutib aynan shu payId bilan qayta so'raymiz: yozilgan bo'lsa server
      // avvalgi natijani qaytaradi (ikkinchi to'lov yozilmaydi)
      for (let n = 0; n < 2 && !res.ok && res.code === 'conflict'; n++) {
        await new Promise((ok) => setTimeout(ok, 1500));
        res = await payOrderAction(order.id, input);
      }
      return res;
    });
    // Javob kelmadi (run timeout) yoki tarmoq xatosi — payId saqlanadi, qayta bosish xavfsiz
    if (!r) return;
    if (r.ok) {
      setDone(r.data);
      return;
    }
    if (r.code === 'sendFailed' && Array.isArray(r.details?.failed)) onFailed(r.details.failed as SendFailure[]);
  }

  function again() {
    setDone(null);
    setPayId(newClientId('pay'));
    setSel({}); setSelText({});
    setMode('full'); setMixed(false); setTile('cash');
    setReceived(''); setAmounts({}); setDiscValue('');
  }

  async function share(path: string, no: string) {
    const url = `${window.location.origin}${path}`;
    const title = tr(p.shareText, { shop: shopName, no });
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
    }
    try { await navigator.clipboard.writeText(url); toast(p.linkCopied, 'success'); }
    catch { window.prompt(p.shareReceipt, url); }
  }

  function fillRest(m: PayMethod) {
    const others = PAY_METHODS.filter((x) => x !== m).reduce((s, x) => s + num(amounts[x] ?? ''), 0);
    setAmounts((a) => ({ ...a, [m]: String(Math.max(0, total - others)) }));
  }

  function toggleItem(id: string, qty: number) {
    setSel((s) => ({ ...s, [id]: s[id] ? 0 : qty }));
    setSelText((s) => ({ ...s, [id]: fmtQty(qty) }));
  }

  // 1–6 — usul, Enter — to'lash
  useEffect(() => {
    if (done) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter' && canPay && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLAnchorElement)) {
        e.preventDefault(); void pay(); return;
      }
      if (isTyping(e.target) || mixed || mode === 'equal') return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < PAY_METHODS.length) { e.preventDefault(); setTile(PAY_METHODS[i]); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  /* ───────── to'lovdan keyin ───────── */
  if (done) {
    const receiptUrl = `/app/sales/receipt?ids=${done.saleIds.join(',')}`;
    return (
      <Modal
        title={k.paidTitle}
        onClose={onClose}
        className="rt-pay"
        footer={done.closed ? (
          <>
            <button type="button" className="btn btn-ghost" onClick={onClose}>{d.common.close}</button>
            {onBack
              ? <button type="button" className="btn btn-primary" onClick={onBack} data-autofocus>{backLabel ?? k.backToTables}</button>
              : <Link href={backHref} className="btn btn-primary" data-autofocus>{backLabel ?? k.backToTables}</Link>}
          </>
        ) : (
          <>
            <button type="button" className="btn btn-ghost" onClick={onClose}>{d.common.close}</button>
            <button type="button" className="btn btn-primary" onClick={again} data-autofocus>
              {tr(k.payRest, { sum: fmtMoney(order.bill.due) })}
            </button>
          </>
        )}
      >
        <div className="pos-done rt-paid">
          <span className="pos-done-ic" aria-hidden="true"><Icon name="check" size={30} /></span>
          <p className="pos-done-sum">{fmtMoney(done.total)} {d.common.sum}</p>
          <p className="pos-done-note">{tr(k.receiptNo, { no: done.receiptNo })}</p>
          {done.change > 0 && <p className="pos-done-note rt-change">{tr(p.doneChange, { sum: fmtMoney(done.change) })}</p>}
          {done.closed
            ? <p className="pos-done-note">{k.closedPaid}</p>
            : <p className="pos-done-note is-debt">{tr(k.remainingDue, { sum: fmtMoney(order.bill.due) })}</p>}
          <div className="pos-done-grid rt-paid-grid">
            <a href={receiptUrl} target="_blank" rel="noopener" className="pos-done-act">
              <Icon name="download" size={20} />{p.openReceipt}
            </a>
            <button type="button" className="pos-done-act" onClick={() => setPrintKey(Date.now())}>
              <Icon name="clipboard" size={20} />{p.printReceipt}
            </button>
            <button type="button" className="pos-done-act" onClick={() => share(done.publicPath, done.receiptNo)}>
              <Icon name="send" size={20} />{p.shareReceipt}
            </button>
          </div>
          {printKey > 0 && (
            <iframe key={printKey} src={`${receiptUrl}&print=1`} title={p.printReceipt} className="rt-print-frame" aria-hidden="true" tabIndex={-1} />
          )}
        </div>
      </Modal>
    );
  }

  /* ───────── to'lov ───────── */
  const label = (m: PayMethod) => d.sales.payMethods[m];
  const notes = [...new Set(NOTES.map((n) => Math.ceil(total / n) * n))].filter((n) => n > total).slice(0, 3);
  const allSelected = unpaid.length > 0 && unpaid.every((i) => (sel[i.id] ?? 0) >= i.qty);

  return (
    <Modal
      title={k.payTitle}
      onClose={onClose}
      busy={busy}
      wide
      className="rt-pay"
      footer={(
        <div className="rt-pay-foot">
          <p className={`pos-pm-status${errText || (due > 0 && entered > 0) ? ' is-bad' : ''}`} aria-live="polite">
            {pendingN > 0 ? d.restaurant.errors.pendingItems
              : !totals ? (lines.length ? d.restaurant.errors.discountTooBig : k.selectNone)
                : errText ?? (result.ok && result.change > 0
                  ? <>{p.change}: <b>{fmtMoney(result.change)} {d.common.sum}</b></>
                  : due > 0 ? <>{p.stillDue}: <b>{fmtMoney(due)} {d.common.sum}</b></>
                    : <>{p.toPay}: <b>{fmtMoney(total)} {d.common.sum}</b></>)}
          </p>
          <div className="pos-pm-acts">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{d.common.cancel}</button>
            <button type="button" className="btn btn-primary" onClick={pay} disabled={!canPay}>
              {busy ? d.common.loading : tr(k.payDo, { sum: fmtMoney(total) })}
            </button>
          </div>
        </div>
      )}
    >
      <div className="rt-pay-body">
        {(can?.split || unpaid.length > 0) && (
          <div className="rt-seg rt-seg--full" role="radiogroup" aria-label={k.payMode}>
            <button type="button" role="radio" aria-checked={mode === 'full'} onClick={() => setMode('full')}>{k.modeFull}</button>
            {can?.split && (
              <button type="button" role="radio" aria-checked={mode === 'items'} onClick={() => setMode('items')}>{k.modeItems}</button>
            )}
            <button type="button" role="radio" aria-checked={mode === 'equal'} onClick={() => setMode('equal')}>{k.splitEqual}</button>
          </div>
        )}

        {pendingN > 0 ? <p className="rt-hint rt-hint--warn">{d.restaurant.errors.pendingItems}</p>
          : unsentN > 0 ? <p className="rt-hint">{k.payUnsentHint}</p> : null}

        {mode === 'items' && (
          <div className="rt-split">
            <div className="rt-split-head">
              <span className="rt-label">{k.selectItems}</span>
              <button
                type="button"
                className="btn btn-plain btn-sm"
                onClick={() => {
                  const next: Record<string, number> = {};
                  if (!allSelected) for (const i of unpaid) next[i.id] = i.qty;
                  setSel(next);
                  setSelText(Object.fromEntries(unpaid.map((i) => [i.id, fmtQty(i.qty)])));
                }}
              >
                {allSelected ? k.selectClear : k.selectAll}
              </button>
            </div>
            <ul className="rt-split-list">
              {unpaid.map((i) => {
                const q = sel[i.id] ?? 0;
                const frac = isFractionalUnit(i.unit);
                return (
                  <li key={i.id} className={q > 0 ? 'is-on' : ''}>
                    <label className="rt-split-check">
                      <input type="checkbox" checked={q > 0} onChange={() => toggleItem(i.id, i.qty)} />
                      <span><b>{i.displayName}</b><small>{fmtQty(i.qty)} × {fmtMoney(i.price)}</small></span>
                    </label>
                    {q > 0 && (i.qty > 1 || frac) && (
                      <QtyStepper
                        value={q}
                        onChange={(n) => { setSel((s) => ({ ...s, [i.id]: n })); setSelText((s) => ({ ...s, [i.id]: fmtQty(n) })); }}
                        min={1}
                        max={Math.floor(i.qty) || 1}
                        label={`${k.qty}: ${i.displayName}`}
                        decLabel={k.qtyDec}
                        incLabel={k.qtyInc}
                        fractional={frac}
                        text={selText[i.id]}
                        onText={(s) => {
                          setSelText((t) => ({ ...t, [i.id]: s }));
                          const n = parseQty(s, i.unit);
                          if (n !== null && n <= i.qty) setSel((x) => ({ ...x, [i.id]: n }));
                        }}
                      />
                    )}
                    <span className="rt-split-sum">{fmtMoney(priceTimesQty(i.price, q || i.qty))}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {can?.discount && (
          <div className="rt-disc">
            <span className="rt-label">{k.discount}</span>
            <div className="pos-discount">
              <input className="input" inputMode="numeric" value={discValue} onChange={(e) => setDiscValue(e.target.value.replace(/\D/g, ''))} placeholder="0" aria-label={k.discount} />
              <div className="pos-seg" role="group" aria-label={k.discount}>
                <button type="button" aria-pressed={discKind === 'percent'} onClick={() => setDiscKind('percent')}>%</button>
                <button type="button" aria-pressed={discKind === 'amount'} onClick={() => setDiscKind('amount')}>{d.common.sum}</button>
              </div>
            </div>
            <div className="pos-presets">
              {DISCOUNT_PRESETS.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={discKind === 'percent' && discValue === String(v)}
                  onClick={() => { setDiscKind('percent'); setDiscValue(discKind === 'percent' && discValue === String(v) ? '' : String(v)); }}
                >
                  {v}%
                </button>
              ))}
            </div>
          </div>
        )}

        {totals && (
          <dl className="rt-sum">
            <div><dt>{k.subtotal}</dt><dd>{fmtMoney(totals.subtotal)}</dd></div>
            {totals.discount > 0 && <div className="is-disc"><dt>{k.discount}</dt><dd>− {fmtMoney(totals.discount)}</dd></div>}
            {servicePct > 0 && <div><dt>{tr(c.serviceChargeLine, { pct: servicePct })}</dt><dd>{fmtMoney(totals.serviceCharge)}</dd></div>}
            {totals.packFee > 0 && <div><dt>{c.packFeeLine}</dt><dd>{fmtMoney(totals.packFee)}</dd></div>}
            {order.bill.paid > 0 && <div className="is-muted"><dt>{k.paidBefore}</dt><dd>{fmtMoney(order.bill.paid)}</dd></div>}
            <div className="rt-sum-total"><dt>{k.total}</dt><dd>{fmtMoney(total)} <small>{d.common.sum}</small></dd></div>
          </dl>
        )}

        {mode === 'equal' ? (
          <div className="rt-equal">
            <div className="rt-equal-head">
              <span className="rt-label">{k.splitGuests}</span>
              <QtyStepper value={guests} onChange={setGuests} min={2} max={MAX_SHARES} label={k.splitGuests} decLabel={k.qtyDec} incLabel={k.qtyInc} />
            </div>
            <ul className="rt-equal-list">
              {shares.map((a, i) => (
                <li key={i}>
                  <span>{tr(k.guestN, { n: i + 1 })}</span>
                  <b>{fmtMoney(a)}</b>
                  <select
                    className="input"
                    value={shareMethods[i] ?? 'cash'}
                    onChange={(e) => setShareMethods((m) => { const next = [...m]; next[i] = e.target.value as PayMethod; return next; })}
                    aria-label={`${tr(k.guestN, { n: i + 1 })}: ${p.keyPay}`}
                  >
                    {PAY_METHODS.map((m) => <option key={m} value={m}>{label(m)}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <label className="pos-pm-toggle">
              <span><b>{p.mixed}</b><small>{p.mixedHint}</small></span>
              <input type="checkbox" checked={mixed} onChange={(e) => setMixed(e.target.checked)} />
              <span className="pos-switch-ui" aria-hidden="true" />
            </label>
            {mixed ? (
              <div className="pos-pm-mixed">
                {PAY_METHODS.map((m) => (
                  <div key={m} className="pos-pm-mrow">
                    <span className="pos-pm-mlabel"><Icon name={METHOD_ICON[m]} size={16} />{label(m)}</span>
                    <input
                      className="input"
                      inputMode="numeric"
                      value={grouped(amounts[m] ?? '')}
                      onChange={(e) => setAmounts((x) => ({ ...x, [m]: e.target.value.replace(/\D/g, '') }))}
                      placeholder="0"
                      aria-label={label(m)}
                    />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => fillRest(m)} disabled={due === 0}>{p.rest}</button>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="pos-pm-tiles" role="radiogroup" aria-label={p.keyPay}>
                  {PAY_METHODS.map((m, i) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={tile === m}
                      className={`pos-pm-tile${tile === m ? ' is-on' : ''}`}
                      onClick={() => setTile(m)}
                    >
                      <Icon name={METHOD_ICON[m]} size={20} />
                      <b>{label(m)}</b>
                      <kbd className="pos-kbd" aria-hidden="true">{i + 1}</kbd>
                    </button>
                  ))}
                </div>
                {tile === 'cash' && (
                  <div className="pos-pm-panel">
                    <label className="pos-label" htmlFor="rt-pay-recv">{p.received}</label>
                    <input
                      id="rt-pay-recv"
                      className="input pos-pm-big"
                      inputMode="numeric"
                      value={grouped(received)}
                      onChange={(e) => setReceived(e.target.value.replace(/\D/g, ''))}
                      placeholder={fmtMoney(total)}
                    />
                    <div className="pos-presets pos-pm-notes">
                      <button type="button" aria-pressed={!received} onClick={() => setReceived('')}>{p.exact}</button>
                      {notes.map((n) => (
                        <button key={n} type="button" aria-pressed={num(received) === n} onClick={() => setReceived(String(n))}>{fmtMoney(n)}</button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
