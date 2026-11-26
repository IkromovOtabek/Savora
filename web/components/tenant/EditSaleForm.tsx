'use client';

import { useActionState, useCallback, useEffect, useMemo, useState } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { editSaleAction } from '@/app/actions/sales';
import { fmtMoney } from '@/lib/format';
import { computeProductSwap, type SwapSettle } from '@/lib/saleEdit';
import type { PaymentType } from '@/lib/models/tenant/Sale';
import type { ProductUnit } from '@/lib/businessTypes';
import type { PayMethod } from '@/lib/payMethods';
import { priceTimesQty } from '@/lib/qty';
import PayMethodPicker from '@/components/tenant/PayMethodPicker';
import PriceInput from '@/components/ui/PriceInput';
import CustomerPicker, { type PickedCustomer } from '@/components/tenant/CustomerPicker';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr, qtyWithUnit } from '@/lib/i18n/fmt';

interface Props {
  saleId: string;
  customer: PickedCustomer;
  notes: string;
  /** YYYY-MM-DD yoki '' */
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentType: PaymentType;
  canEditPrice: boolean;
  /** Nasiya boshlang'ich to'lovi (mijoz qismi undan katta bo'lishi kerak) */
  downPayment: number;
  /** Nasiya: oylar soni va to'lov kuni (0 — sotuv sanasi bo'yicha) */
  installmentMonths: number;
  payDay: number;
  /** Shu xariddagi tovarlar soni (mijoz hammasiga qo'llanadi) */
  checkoutItems: number;
  /** Almashtirish uchun: sotuv filialidagi omborda bor tovarlar (joriy tovarsiz) */
  swapProducts: SwapProduct[];
  /** Markirovka kodi bor sotuv — tovar almashtirilmaydi */
  swapBlocked: boolean;
  /** Sotuvdagi miqdor va birligi */
  saleQty: number;
  saleUnit: ProductUnit | null;
  /** Bank ulushlari jami (o'zgarmaydi) */
  bank: number;
}

export interface SwapProduct {
  id: string;
  name: string;
  imei?: string;
  barcode?: string;
  salePrice: number;
  tracked: boolean;
  available: number;
  unit: ProductUnit | null;
}

const PICK_LIMIT = 30;
const HASH = '#tahrir';

/**
 * Sotuvni tahrirlash — modal oyna (sahifa boshidagi «Tahrirlash» tugmasi #tahrir bilan ochadi).
 * Barcha turlarda (naqd, qarz, nasiya, bank krediti): mijoz, tovar, summa, qarz muddati, nasiya muddati, izoh.
 * Summa o'zgarsa pul oqibati oldindan ko'rsatiladi (lib/saleEdit computeProductSwap — yadro bilan bir xil).
 */
export default function EditSaleForm(p: Props) {
  const [state, formAction, isPending] = useActionState(editSaleAction, null);
  useToastOnState(state);
  const d = useDict();
  const t = d.sales.editForm;
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState<PickedCustomer>(p.customer);
  const [price, setPrice] = useState(String(p.totalAmount));
  const hadCustomer = !!(p.customer.name || p.customer.phone);
  // Mijoz bloki: naqd sotuvda mijozsiz ham bo'ladi (Picker'dagi telefon majburiy — shuning uchun alohida ochiladi)
  const [custOn, setCustOn] = useState(hadCustomer || p.paymentType !== 'cash' || p.remainingAmount > 0);
  const [swapOn, setSwapOn] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<SwapProduct | null>(null);
  const [settle, setSettle] = useState<SwapSettle>('now');
  const [method, setMethod] = useState<PayMethod>('cash');
  const [months, setMonths] = useState(String(p.installmentMonths || ''));
  const [payDay, setPayDay] = useState(p.payDay ? String(p.payDay) : '');

  const reset = useCallback(() => {
    setSwapOn(false);
    setPicked(null);
    setQuery('');
    setPrice(String(p.totalAmount));
    setSettle('now');
    setMethod('cash');
    setMonths(String(p.installmentMonths || ''));
    setPayDay(p.payDay ? String(p.payDay) : '');
  }, [p.totalAmount, p.installmentMonths, p.payDay]);

  const close = useCallback(() => {
    setOpen(false);
    reset();
    // Xesh olib tashlanadi — tugma qayta bosilganda yana ochiladi
    if (window.location.hash === HASH) history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [reset]);

  // «Tahrirlash» tugmasi (sahifa boshida) #tahrir ga olib keladi — modal darhol ochiladi
  useEffect(() => {
    const sync = () => { if (window.location.hash === HASH) setOpen(true); };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  // Saqlangach — yangi qiymatlar sahifadan keladi, modal yopiladi
  useEffect(() => {
    if (state?.success) close();
  }, [state, close]);
  // Ochiqda: sahifa aylanmaydi, Esc — yopish
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isPending) close(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [open, isPending, close]);

  const { id: cid, name: cname, phone: cphone } = p.customer;
  useEffect(() => { setCustomer({ id: cid, name: cname, phone: cphone }); setCustOn(!!(cname || cphone) || p.paymentType !== 'cash' || p.remainingAmount > 0); }, [cid, cname, cphone, p.paymentType, p.remainingAmount]);
  useEffect(() => { setPrice(String(p.totalAmount)); }, [p.totalAmount]);

  // Tovar qidiruvi: nom, IMEI, shtrix-kod (bo'sh — birinchi tovarlar)
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = q
      ? p.swapProducts.filter((x) => x.name.toLowerCase().includes(q) || (x.imei ?? '').toLowerCase().includes(q) || (x.barcode ?? '') === q)
      : p.swapProducts;
    return { items: all.slice(0, PICK_LIMIT), more: Math.max(0, all.length - PICK_LIMIT) };
  }, [p.swapProducts, query]);
  // Miqdorli tovar (va xizmat) — shu miqdor; yagona dona — 1 (yadro checkSaleQty bilan bir xil)
  const swapQty = picked ? (picked.tracked ? p.saleQty : 1) : 0;
  const pick = (x: SwapProduct) => {
    setPicked(x);
    const list = priceTimesQty(x.salePrice, x.tracked ? p.saleQty : 1);
    setPrice(list > 0 ? String(list) : '');
  };
  const swapping = swapOn && !!picked;

  // Summa va pul oqibati — tovar almashtirilganda ham, narx o'zgarganda ham bitta hisob
  const total = Number(price);
  const priceChanged = price !== '' && total !== p.totalAmount;
  const calcRes = (swapping || (p.canEditPrice && priceChanged)) && price !== ''
    ? computeProductSwap({
      totalAmount: p.totalAmount, paidAmount: p.paidAmount, remainingAmount: p.remainingAmount,
      paymentType: p.paymentType, status: 'partial', bank: p.bank, downPayment: p.downPayment,
    }, total, settle)
    : null;
  const calc = calcRes?.ok ? calcRes.calc : null;
  const remainingAfter = calc ? calc.newRemaining : p.remainingAmount;

  const isInstallment = p.paymentType === 'installment';
  // Qarz muddati — qarz yoki qoldiqli naqd sotuvda (nasiyada — oylik jadval)
  const showDue = (p.paymentType === 'debt' || p.paymentType === 'cash') && (remainingAfter > 0 || p.dueDate !== '');
  const customerRequired = p.paymentType !== 'cash' || remainingAfter > 0;
  const customerChanged = customer.id !== cid || customer.name !== cname || customer.phone !== cphone;
  // Summa oshib qoldiq paydo bo'lsa — mijoz shart
  useEffect(() => { if (customerRequired) setCustOn(true); }, [customerRequired]);

  // Nasiya oylik to'lovi (taxminan): mijoz qismi − boshlang'ich, oylarga teng
  const monthsN = Number(months);
  const financed = Math.max(0, (calc ? calc.newTotal : p.totalAmount) - p.bank - (calc?.newDown ?? p.downPayment));
  const monthly = isInstallment && Number.isInteger(monthsN) && monthsN > 0 ? Math.round(financed / monthsN) : 0;

  const blocked = isPending || (calcRes !== null && !calcRes.ok) || (swapOn && !picked);

  if (!open) return null;
  return (
    <div className="u-modal-overlay" onClick={() => !isPending && close()}>
      <div className="u-modal u-modal--wide sl-edit-modal" role="dialog" aria-modal="true" aria-labelledby="sl-edit-h" onClick={(e) => e.stopPropagation()}>
        <div className="u-modal-head">
          <h3 id="sl-edit-h">{t.title}</h3>
          <button type="button" className="u-icon-btn" onClick={close} disabled={isPending} aria-label={t.close}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <form id="sl-edit-form" action={formAction}>
          <input type="hidden" name="saleId" value={p.saleId} />
          <input type="hidden" name="settle" value={calc && !calc.canDebt ? 'now' : settle} />
          {state?.error && <div className="auth-alert auth-alert--error">{state.error}</div>}
          <p className="sl-return-text">{t.text}</p>

          {/* Mijoz — customerOn: faqat o'zgartirilganda yuboriladi; blok yopilgan bo'lsa — mijoz olib tashlanadi */}
          {(custOn ? customerChanged : hadCustomer) && <input type="hidden" name="customerOn" value="1" />}
          {custOn ? (
            <div className="sl-edit-cust">
              <CustomerPicker value={customer} onChange={setCustomer} disabled={isPending} named />
              {p.checkoutItems > 1 && <small className="sl-edit-hint">{tr(t.customerAllItems, { n: p.checkoutItems })}</small>}
              {!customerRequired && (
                <button type="button" className="btn btn-ghost btn-sm btn-with-icon sl-edit-cust-x" onClick={() => setCustOn(false)} disabled={isPending}>
                  <Icon name="close" size={14} />
                  {t.customerRemove}
                </button>
              )}
            </div>
          ) : (
            <div className="sl-edit-cust">
              <span className="sl-edit-hint">{hadCustomer ? t.customerRemoved : t.customerOptional}</span>
              <button type="button" className="btn btn-tinted btn-sm btn-with-icon sl-edit-cust-x" onClick={() => { setCustomer(p.customer); setCustOn(true); }} disabled={isPending}>
                <Icon name="plus" size={14} />
                {hadCustomer ? t.customerRestore : t.customerAdd}
              </button>
            </div>
          )}

          {/* Tovar */}
          <div className="auth-field">
            <span className="sl-pm-l">{t.product}</span>
            {p.swapBlocked ? (
              <small className="sl-edit-hint">{t.productMarked}</small>
            ) : !swapOn ? (
              <button type="button" className="btn btn-tinted btn-sm btn-with-icon sl-edit-cust-x" onClick={() => setSwapOn(true)} disabled={isPending}>
                <Icon name="edit" size={14} />
                {t.productChange}
              </button>
            ) : (
              <>
                {picked ? (
                  <div className="sl-edit-cust">
                    <input type="hidden" name="productId" value={picked.id} />
                    <span><b>{picked.name}</b>{picked.imei ? ` · ${picked.imei}` : ''}</span>
                    <small className="sl-edit-hint">{tr(t.productHint, { n: qtyWithUnit(swapQty, p.saleUnit, d.stock.fields.units) })}</small>
                    <button type="button" className="btn btn-ghost btn-sm btn-with-icon sl-edit-cust-x" onClick={() => { setPicked(null); setPrice(String(p.totalAmount)); }} disabled={isPending}>
                      <Icon name="search" size={14} />
                      {t.productSearch}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="sl-search">
                      <Icon name="search" size={16} />
                      <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t.productSearchPh}
                        aria-label={t.productSearch}
                        disabled={isPending}
                        autoComplete="off"
                      />
                    </div>
                    <ul className="sl-picker" role="group" aria-label={t.productSearch}>
                      {matches.items.length === 0 && <li className="sl-picker-more">{t.productNone}</li>}
                      {matches.items.map((x) => (
                        <li key={x.id}>
                          <button type="button" className="sl-pick" onClick={() => pick(x)} disabled={isPending}>
                            <b>{x.name}</b>
                            <span>
                              {x.imei ?? ''}
                              {x.tracked ? `${x.imei ? ' · ' : ''}${tr(t.productLeft, { n: qtyWithUnit(x.available, x.unit, d.stock.fields.units) })}` : ''}
                            </span>
                            <strong>{fmtMoney(x.salePrice)}</strong>
                          </button>
                        </li>
                      ))}
                      {matches.more > 0 && <li className="sl-picker-more">+{matches.more}</li>}
                    </ul>
                  </>
                )}
                <button type="button" className="btn btn-ghost btn-sm btn-with-icon sl-edit-cust-x" onClick={() => { setSwapOn(false); setPicked(null); setPrice(String(p.totalAmount)); }} disabled={isPending}>
                  <Icon name="close" size={14} />
                  {t.productKeep}
                </button>
              </>
            )}
          </div>

          {/* Summa — barcha to'lov turlarida (bank ulushi o'zgarmaydi) */}
          <div className="auth-field">
            <label htmlFor="edit-price">{swapping ? t.swapPrice : t.price}</label>
            {p.canEditPrice ? (
              <PriceInput id="edit-price" name="totalAmount" required disabled={isPending} value={price} onValueChange={setPrice} />
            ) : (
              <input id="edit-price" value={price ? fmtMoney(total) : ''} readOnly />
            )}
            <small className="sl-edit-hint">
              {swapping ? t.swapPriceHint : p.canEditPrice ? t.priceAny : t.priceNoPerm}
              {isInstallment && p.canEditPrice ? ` ${t.priceInstallment}` : ''}
            </small>
          </div>

          {calc && (calc.delta !== 0 || swapping) && (
            <div className={`sl-remain-box sl-swap-box${calc.refundAmount > 0 ? ' sl-remain-box--out' : ''}`} role="status" aria-label={t.swapTitle}>
              <ul className="sl-swap-rows">
                <li><span>{t.swapOld}</span><b>{fmtMoney(p.totalAmount)}</b></li>
                <li><span>{t.swapNew}</span><b>{fmtMoney(calc.newTotal)}</b></li>
                <li><span>{t.swapPaid}</span><b>{fmtMoney(p.paidAmount)}</b></li>
                {p.bank > 0 && <li><span>{t.swapBank}</span><b>{fmtMoney(p.bank)}</b></li>}
                {p.paymentType !== 'bank_credit' && p.remainingAmount > 0 && <li><span>{t.swapDebt}</span><b>{fmtMoney(p.remainingAmount)}</b></li>}
              </ul>
              <strong>
                {calc.delta === 0 ? t.swapEven
                  : calc.collectNow > 0 ? tr(t.swapCollect, { sum: fmtMoney(calc.collectNow) })
                  : calc.addedToDebt > 0 ? tr(t.swapToDebt, { sum: fmtMoney(calc.addedToDebt), rest: fmtMoney(calc.newRemaining) })
                  : calc.refundAmount > 0 ? tr(t.swapRefund, { sum: fmtMoney(calc.refundAmount) })
                  : tr(t.swapDebtDown, { sum: fmtMoney(calc.newRemaining) })}
              </strong>
              {calc.refundAmount > 0 && calc.debtReduced > 0 && <span>{tr(t.swapDebtDown, { sum: fmtMoney(calc.newRemaining) })}</span>}
            </div>
          )}
          {calcRes && !calcRes.ok && (
            <div className="auth-alert auth-alert--error">
              {calcRes.error === 'belowBank' ? d.sales.actions.editBelowBank
                : calcRes.error === 'belowDown' ? d.sales.actions.editBelowDown
                : d.sales.actions.editBadAmount}
            </div>
          )}
          {calc && calc.delta > 0 && (calc.canDebt ? (
            <div className="sl-payform-quick" role="group" aria-label={t.swapTitle}>
              <button type="button" className="sl-quick" aria-pressed={settle === 'now'} onClick={() => setSettle('now')} disabled={isPending}>{t.settleNow}</button>
              <button type="button" className="sl-quick" aria-pressed={settle === 'debt'} onClick={() => setSettle('debt')} disabled={isPending}>
                {isInstallment ? t.settleInstallment : t.settleDebt}
              </button>
            </div>
          ) : (
            <small className="sl-edit-hint">{t.settleBankOnly}</small>
          ))}
          {calc && calc.collectNow > 0 && <PayMethodPicker value={method} onChange={setMethod} disabled={isPending} name="method" />}

          {/* Nasiya muddati: oylar soni va to'lov kuni */}
          {isInstallment && (
            <fieldset className="sl-edit-terms">
              <legend className="sl-pm-l">{t.termsTitle}</legend>
              <input type="hidden" name="termsOn" value="1" />
              <div className="sl-edit-terms-row">
                <div className="auth-field">
                  <label htmlFor="edit-months">{t.months}</label>
                  <input id="edit-months" name="installmentMonths" type="number" inputMode="numeric" min={1} max={60} step={1} required={p.installmentMonths > 0} value={months} onChange={(e) => setMonths(e.target.value)} disabled={isPending} />
                </div>
                <div className="auth-field">
                  <label htmlFor="edit-payday">{t.payDay}</label>
                  <input id="edit-payday" name="payDay" type="number" inputMode="numeric" min={1} max={31} step={1} value={payDay} onChange={(e) => setPayDay(e.target.value)} placeholder={t.payDayPh} disabled={isPending} />
                </div>
              </div>
              <small className="sl-edit-hint">
                {monthly > 0 ? `${tr(t.monthlyPreview, { sum: fmtMoney(monthly) })}. ` : ''}{t.termsHint}
              </small>
            </fieldset>
          )}

          {showDue && (
            <div className="auth-field">
              <input type="hidden" name="dueOn" value="1" />
              <label htmlFor="edit-due">{t.dueDate}</label>
              <input id="edit-due" name="dueDate" type="date" defaultValue={p.dueDate} disabled={isPending} />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="edit-notes">{t.notes}</label>
            <textarea id="edit-notes" name="notes" rows={2} maxLength={500} defaultValue={p.notes} disabled={isPending} placeholder={t.notesPh} />
          </div>

          <div className="u-modal-actions">
            <button type="button" className="btn btn-ghost" onClick={close} disabled={isPending}>{t.close}</button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={blocked}
              onClick={(e) => {
                if (calc && calc.refundAmount > 0 && !confirm(tr(t.confirmRefund, { sum: fmtMoney(calc.refundAmount) }))) e.preventDefault();
                else if (calc && calc.collectNow > 0 && !confirm(tr(t.confirmCollect, { sum: fmtMoney(calc.collectNow) }))) e.preventDefault();
              }}
            >
              {isPending ? t.pending : t.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
