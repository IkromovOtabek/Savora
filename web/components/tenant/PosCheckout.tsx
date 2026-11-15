'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon, { type IconName } from '@/components/icons/Icon';
import { fmtMoney } from '@/lib/format';
import { toast } from '@/lib/toast';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { PAY_METHODS, settlePayment, type PayMethod, type PayPart } from '@/lib/payMethods';
import type { PosDone } from '@/app/actions/pos';

export interface PosPayment { mode: 'full' | 'debt' | 'installment'; parts: PayPart[]; dueDate?: string; months?: number }

const METHOD_ICON: Record<PayMethod, IconName> = { cash: 'wallet', uzcard: 'plans', humo: 'plans', click: 'phone', payme: 'phone' };
type Tile = PayMethod | 'debt';
const TILES: Tile[] = [...PAY_METHODS, 'debt'];
/** Naqd: tez tanlov — summani shu kupyuraga yaxlitlash */
const NOTES = [1000, 5000, 10000, 50000, 100000, 200000];
const AUTO_PRINT_KEY = 'savora_pos_autoprint';
/** Naqd yetmaganda: qoldiqni qaytarish muddati (kun) yoki nasiya oylari */
const REST_DUE: { key: 'week1' | 'week2' | 'month1' | 'month3'; days: number }[] = [
  { key: 'week1', days: 7 }, { key: 'week2', days: 14 }, { key: 'month1', days: 30 }, { key: 'month3', days: 90 },
];
const REST_MONTHS = [3, 6, 9, 12];

/** Mahalliy sana YYYY-MM-DD (bugundan n kun keyin) */
function dayPlus(n: number): string {
  const x = new Date();
  x.setDate(x.getDate() + n);
  const p = (v: number) => String(v).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

const num = (s: string) => Number(s.replace(/\D/g, '')) || 0;
const grouped = (s: string) => (s ? fmtMoney(num(s)) : '');

function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
}

/**
 * Kassa to'lov oynasi (BILLZ uslubi): katta summa, usul plitkalari (Naqd/UzCard/HUMO/Click/Payme/Qarzga),
 * "Aralash to'lov" — har usulga summa; naqdda "Mijoz bergan pul → Qaytim". Hisob serverdagi settlePayment bilan bir xil.
 */
export function PosPayModal({ total, pending, customerName, customerPhone, onCustomerName, onCustomerPhone, onCancel, onConfirm, lineCount = 1, canInstallment = false }: {
  total: number;
  pending: boolean;
  /** Savatchadagi qatorlar — nasiya faqat bitta tovarda */
  lineCount?: number;
  /** «Nasiya» moduli yoqilgan */
  canInstallment?: boolean;
  customerName: string;
  customerPhone: string;
  onCustomerName: (v: string) => void;
  onCustomerPhone: (v: string) => void;
  onCancel: () => void;
  onConfirm: (p: PosPayment) => void;
}) {
  const d = useDict();
  const k = d.sales.pos;
  const [mixed, setMixed] = useState(false);
  const [tile, setTile] = useState<Tile>('cash');
  const [received, setReceived] = useState('');
  const [amounts, setAmounts] = useState<Partial<Record<PayMethod, string>>>({});
  const [debtPaid, setDebtPaid] = useState('');
  const [debtMethod, setDebtMethod] = useState<PayMethod>('cash');
  const [dueDate, setDueDate] = useState('');
  // Naqd yetmasa: qoldiq — qaytarish sanasi (qarz) yoki nasiya (oyma-oy)
  const [restMode, setRestMode] = useState<'due' | 'installment'>('due');
  const [restMonths, setRestMonths] = useState(6);
  const mk = d.crm.money;
  const installmentOk = canInstallment && lineCount === 1;
  const cashShort = !mixed && tile === 'cash' && num(received) > 0 && num(received) < total;
  const restSum = cashShort ? total - num(received) : 0;
  // Naqd yetmay qolganda qoldiq paneli oyna pastida qolmasin — ko'rinishga aylantiriladi
  const restRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (cashShort) restRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [cashShort]);

  const payment: PosPayment = useMemo(() => {
    if (mixed) return { mode: 'full', parts: PAY_METHODS.map((m) => ({ method: m, amount: num(amounts[m] ?? '') })) };
    if (tile === 'debt') return { mode: 'debt', parts: [{ method: debtMethod, amount: num(debtPaid) }], dueDate: dueDate || undefined };
    if (cashShort) {
      const parts = [{ method: 'cash' as const, amount: num(received) }];
      return restMode === 'installment' && installmentOk
        ? { mode: 'installment', parts, months: restMonths }
        : { mode: 'debt', parts, dueDate: dueDate || undefined };
    }
    if (tile === 'cash') return { mode: 'full', parts: [{ method: 'cash', amount: received ? num(received) : total }] };
    return { mode: 'full', parts: [{ method: tile, amount: total }] };
  }, [mixed, tile, amounts, debtPaid, debtMethod, dueDate, received, total, cashShort, restMode, restMonths, installmentOk]);

  const result = settlePayment(total, payment.parts, payment.mode === 'full' ? 'full' : 'debt');
  const entered = payment.parts.reduce((s, p) => s + p.amount, 0);
  const isDebt = payment.mode !== 'full';
  const phoneDigits = customerPhone.replace(/\D/g, '');
  const needCustomer = isDebt && (!customerName.trim() || phoneDigits.length < 9);
  // Naqd yetmaganda muddat ongli tanlansin: sana yoki nasiya oylari
  const needTerm = cashShort && payment.mode === 'debt' && !dueDate;
  const canPay = result.ok && !needCustomer && !needTerm && !pending;
  const due = Math.max(0, total - entered);

  // 1–6 — usul, Enter — to'lash, Esc — yopish
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); if (!pending) onCancel(); return; }
      if (e.key === 'Enter' && canPay && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); onConfirm(payment); return; }
      if (isTyping(e.target) || mixed || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < TILES.length) { e.preventDefault(); setTile(TILES[i]); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canPay, payment, pending, mixed, onCancel, onConfirm]);

  function fillRest(m: PayMethod) {
    const others = PAY_METHODS.filter((x) => x !== m).reduce((s, x) => s + num(amounts[x] ?? ''), 0);
    setAmounts((a) => ({ ...a, [m]: String(Math.max(0, total - others)) }));
  }

  const label = (t: Tile) => (t === 'debt' ? k.debtTile : d.sales.payMethods[t]);
  const errText = !result.ok && entered > 0 ? k[result.reason] : null;
  const notes = [...new Set(NOTES.map((n) => Math.ceil(total / n) * n))].filter((n) => n > total).slice(0, 3);

  return (
    <div className="u-modal-overlay" onClick={() => !pending && onCancel()}>
      <div className="u-modal pos-pm" role="dialog" aria-modal="true" aria-labelledby="pos-pm-title" onClick={(e) => e.stopPropagation()}>
        <div className="u-modal-head">
          <h3 id="pos-pm-title">{k.payTitle}</h3>
          <button type="button" className="u-icon-btn" onClick={onCancel} disabled={pending} aria-label={d.common.close}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="pos-pm-body">
          <div className="pos-pm-total">{fmtMoney(total)}<small>{d.common.sum}</small></div>

          <label className="pos-pm-toggle">
            <span><b>{k.mixed}</b><small>{k.mixedHint}</small></span>
            <input type="checkbox" checked={mixed} onChange={(e) => setMixed(e.target.checked)} />
            <span className="pos-switch-ui" aria-hidden="true" />
          </label>

          {mixed ? (
            <div className="pos-pm-mixed">
              {PAY_METHODS.map((m) => (
                <div key={m} className="pos-pm-mrow">
                  <span className="pos-pm-mlabel"><Icon name={METHOD_ICON[m]} size={16} />{d.sales.payMethods[m]}</span>
                  <input
                    className="input"
                    inputMode="numeric"
                    value={grouped(amounts[m] ?? '')}
                    onChange={(e) => setAmounts((a) => ({ ...a, [m]: e.target.value.replace(/\D/g, '') }))}
                    placeholder="0"
                    aria-label={d.sales.payMethods[m]}
                  />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => fillRest(m)} disabled={due === 0}>{k.rest}</button>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="pos-pm-tiles" role="radiogroup" aria-label={k.keyPay}>
                {TILES.map((t, i) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={tile === t}
                    className={`pos-pm-tile${tile === t ? ' is-on' : ''}${t === 'debt' ? ' pos-pm-tile--debt' : ''}`}
                    onClick={() => setTile(t)}
                  >
                    <Icon name={t === 'debt' ? 'user' : METHOD_ICON[t]} size={20} />
                    <b>{label(t)}</b>
                    <kbd className="pos-kbd" aria-hidden="true">{i + 1}</kbd>
                  </button>
                ))}
              </div>

              {tile === 'cash' && (
                <div className="pos-pm-panel">
                  <label className="pos-label" htmlFor="pos-pm-recv">{k.received}</label>
                  <input
                    id="pos-pm-recv"
                    className="input pos-pm-big"
                    inputMode="numeric"
                    value={grouped(received)}
                    onChange={(e) => setReceived(e.target.value.replace(/\D/g, ''))}
                    placeholder={fmtMoney(total)}
                  />
                  <div className="pos-presets pos-pm-notes">
                    <button type="button" aria-pressed={!received} onClick={() => setReceived('')}>{k.exact}</button>
                    {notes.map((n) => (
                      <button key={n} type="button" aria-pressed={num(received) === n} onClick={() => setReceived(String(n))}>{fmtMoney(n)}</button>
                    ))}
                  </div>

                  {/* Naqd yetmadi — xato emas: qoldiq qarzga (qaytarish sanasi) yoki nasiyaga, Qarzdorlikka avtomatik tushadi */}
                  {cashShort && (
                    <div className="pos-pm-rest" role="group" aria-labelledby="pos-pm-rest-t" ref={restRef}>
                      <p className="pos-pm-rest-t" id="pos-pm-rest-t">
                        <b>{tr(mk.restTitle, { sum: fmtMoney(restSum) })}</b>
                        <small>{mk.restHint}</small>
                      </p>
                      <div className="pos-seg pos-pm-rest-seg" role="radiogroup" aria-label={mk.restHint}>
                        <button type="button" role="radio" aria-checked={restMode === 'due'} onClick={() => setRestMode('due')}>{mk.restDue}</button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={restMode === 'installment'}
                          onClick={() => setRestMode('installment')}
                          disabled={!installmentOk}
                          title={!installmentOk ? (canInstallment ? mk.restOneItem : undefined) : undefined}
                        >
                          {mk.restInstallment}
                        </button>
                      </div>
                      {restMode === 'installment' && installmentOk ? (
                        <>
                          <div className="pos-presets">
                            {REST_MONTHS.map((n) => (
                              <button key={n} type="button" aria-pressed={restMonths === n} onClick={() => setRestMonths(n)}>{tr(mk.restMonths, { n })}</button>
                            ))}
                          </div>
                          <small className="pos-pm-rest-s">{tr(mk.restMonthly, { sum: fmtMoney(Math.ceil(restSum / restMonths)) })}</small>
                        </>
                      ) : (
                        <>
                          <div className="pos-presets">
                            {REST_DUE.map((p) => {
                              const v = dayPlus(p.days);
                              return <button key={p.key} type="button" aria-pressed={dueDate === v} onClick={() => setDueDate(v)}>{d.sales.duePresets[p.key]}</button>;
                            })}
                          </div>
                          <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} min={dayPlus(0)} aria-label={mk.restDue} />
                          {!installmentOk && canInstallment && lineCount > 1 && <small className="pos-pm-rest-s">{mk.restOneItem}</small>}
                        </>
                      )}
                      <div className="pos-pm-two">
                        <input className="input" value={customerName} onChange={(e) => onCustomerName(e.target.value)} placeholder={k.customerName.replace(/\s*\(.*\)$/, '')} maxLength={100} aria-label={k.customer} autoComplete="off" />
                        <input className="input" type="tel" value={customerPhone} onChange={(e) => onCustomerPhone(e.target.value)} placeholder="+998 99 000 00 00" maxLength={30} inputMode="tel" aria-label={d.common.phone} autoComplete="off" />
                      </div>
                      {needCustomer
                        ? <p className="pos-pm-warn">{mk.restNeedCustomer}</p>
                        : needTerm ? <p className="pos-pm-warn">{mk.restPickTerm}</p>
                          : <small className="pos-pm-rest-s">{mk.restToDebts}</small>}
                    </div>
                  )}
                </div>
              )}

              {tile === 'debt' && (
                <div className="pos-pm-panel">
                  <div className="pos-pm-two">
                    <input className="input" value={customerName} onChange={(e) => onCustomerName(e.target.value)} placeholder={k.customerName.replace(/\s*\(.*\)$/, '')} maxLength={100} aria-label={k.customer} autoComplete="off" />
                    <input className="input" type="tel" value={customerPhone} onChange={(e) => onCustomerPhone(e.target.value)} placeholder="+998 99 000 00 00" maxLength={30} inputMode="tel" aria-label={d.common.phone} autoComplete="off" />
                  </div>
                  <label className="pos-label" htmlFor="pos-pm-dpaid">{k.paidNow}</label>
                  <div className="pos-pm-two">
                    <input id="pos-pm-dpaid" className="input" inputMode="numeric" value={grouped(debtPaid)} onChange={(e) => setDebtPaid(e.target.value.replace(/\D/g, ''))} placeholder="0" />
                    <select className="input" value={debtMethod} onChange={(e) => setDebtMethod(e.target.value as PayMethod)} aria-label={k.keyPay}>
                      {PAY_METHODS.map((m) => <option key={m} value={m}>{d.sales.payMethods[m]}</option>)}
                    </select>
                  </div>
                  <label className="pos-label" htmlFor="pos-pm-due">{k.dueDate}</label>
                  <input id="pos-pm-due" className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
                  {needCustomer && <p className="pos-pm-warn">{k.debtNeedsCustomer}</p>}
                </div>
              )}
            </>
          )}
        </div>

        <div className="pos-pm-foot">
          <p className={`pos-pm-status${errText || (!isDebt && due > 0) ? ' is-bad' : ''}`} aria-live="polite">
            {errText
              ?? (result.ok && result.change > 0 ? <>{k.change}: <b>{fmtMoney(result.change)} {d.common.sum}</b></>
                : isDebt ? <>{k.debtLeft}: <b>{fmtMoney(Math.max(0, total - entered))} {d.common.sum}</b></>
                  : due > 0 ? <>{k.stillDue}: <b>{fmtMoney(due)} {d.common.sum}</b></>
                    : <>{k.toPay}: <b>{fmtMoney(total)} {d.common.sum}</b></>)}
          </p>
          <div className="pos-pm-acts">
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={pending}>{k.cancel}</button>
            <button type="button" className="btn btn-primary" onClick={() => onConfirm(payment)} disabled={!canPay}>
              {pending ? '…' : payment.mode === 'installment' ? mk.confirmInstallment : isDebt ? k.confirmDebt : k.confirmPay}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Sotuvdan keyingi oyna: chekni ochish / ulashish (imzolangan ochiq havola), "doim chop etish"
 * (shu qurilmada eslab qolinadi — yashirin iframe orqali, popup blokerga tushmaydi) va "Davom etish".
 */
export function PosDoneModal({ done, shopName, onClose }: { done: PosDone; shopName: string; onClose: () => void }) {
  const d = useDict();
  const k = d.sales.pos;
  const [autoPrint, setAutoPrint] = useState(false);
  const [printNow, setPrintNow] = useState(false);
  const receiptUrl = `/app/sales/receipt?ids=${done.saleIds.join(',')}`;

  useEffect(() => {
    let on = false;
    try { on = localStorage.getItem(AUTO_PRINT_KEY) === '1'; } catch { /* yopiq */ }
    setAutoPrint(on);
    if (on) setPrintNow(true);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' || (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLAnchorElement))) { e.preventDefault(); onClose(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggleAuto(v: boolean) {
    setAutoPrint(v);
    try { localStorage.setItem(AUTO_PRINT_KEY, v ? '1' : '0'); } catch { /* e'tiborsiz */ }
    if (v) setPrintNow(true);
  }

  async function share() {
    const url = `${window.location.origin}${done.publicPath}`;
    const title = tr(k.shareText, { shop: shopName, no: done.receiptNo });
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
    }
    try { await navigator.clipboard.writeText(url); toast(k.linkCopied, 'success'); }
    catch { window.prompt(k.shareReceipt, url); }
  }

  return (
    <div className="u-modal-overlay" onClick={onClose}>
      <div className="u-modal pos-done" role="dialog" aria-modal="true" aria-labelledby="pos-done-title" onClick={(e) => e.stopPropagation()}>
        <span className="pos-done-ic" aria-hidden="true"><Icon name="check" size={30} /></span>
        <h3 id="pos-done-title">{tr(k.doneTitle, { no: done.receiptNo })}</h3>
        <p className="pos-done-sum">{fmtMoney(done.total)} {d.common.sum}</p>
        {done.change > 0 && <p className="pos-done-note">{tr(k.doneChange, { sum: fmtMoney(done.change) })}</p>}
        {done.debt > 0 && <p className="pos-done-note is-debt">{tr(k.doneDebt, { sum: fmtMoney(done.debt) })}</p>}

        <div className="pos-done-grid">
          <a href={receiptUrl} target="_blank" rel="noopener" className="pos-done-act">
            <Icon name="download" size={20} />{k.openReceipt}
          </a>
          <button type="button" className="pos-done-act" onClick={share}>
            <Icon name="send" size={20} />{k.shareReceipt}
          </button>
        </div>

        <label className="pos-pm-toggle">
          <span><b>{k.autoPrint}</b></span>
          <input type="checkbox" checked={autoPrint} onChange={(e) => toggleAuto(e.target.checked)} />
          <span className="pos-switch-ui" aria-hidden="true" />
        </label>

        <button type="button" className="btn btn-primary btn-full pos-done-go" onClick={onClose} autoFocus>{k.continue}</button>

        {/* Chop etish: chek sahifasi o'zi window.print() chaqiradi (print=1) */}
        {printNow && <iframe src={`${receiptUrl}&print=1`} title={k.printReceipt} className="pos-print-frame" aria-hidden="true" tabIndex={-1} />}
      </div>
    </div>
  );
}
