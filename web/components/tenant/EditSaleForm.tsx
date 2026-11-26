'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { editSaleAction } from '@/app/actions/sales';
import { fmtMoney } from '@/lib/format';
import { computePriceEdit, computeProductSwap, type SwapSettle } from '@/lib/saleEdit';
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
  /** Bank krediti / bank + nasiya / bank + qarz — narx qat'iy */
  priceLocked: boolean;
  canEditPrice: boolean;
  /** Nasiya boshlang'ich to'lovi (narx undan katta bo'lishi kerak) */
  downPayment: number;
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

/** Sotuvni tahrirlash: mijoz, izoh, qarz muddati, narx — pul oqibati oldindan ko'rsatiladi (lib/saleEdit) */
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

  // «Tahrirlash» tugmasi (sahifa boshida) #tahrir ga olib keladi — forma ochiladi
  useEffect(() => {
    const sync = () => { if (window.location.hash === '#tahrir') setOpen(true); };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  // Saqlangach — yangi qiymatlar sahifadan keladi, forma yopiladi
  useEffect(() => {
    if (state?.success) { setOpen(false); setSwapOn(false); setPicked(null); }
  }, [state]);
  const { id: cid, name: cname, phone: cphone } = p.customer;
  useEffect(() => { setCustomer({ id: cid, name: cname, phone: cphone }); setCustOn(!!(cname || cphone) || p.paymentType !== 'cash' || p.remainingAmount > 0); }, [cid, cname, cphone, p.paymentType, p.remainingAmount]);
  useEffect(() => { setPrice(String(p.totalAmount)); }, [p.totalAmount]);

  // Tovarni almashtirish
  const [swapOn, setSwapOn] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<SwapProduct | null>(null);
  const [swapPrice, setSwapPrice] = useState('');
  const [settle, setSettle] = useState<SwapSettle>('now');
  const [method, setMethod] = useState<PayMethod>('cash');
  // Qidiruv: nom, IMEI, shtrix-kod (bo'sh — birinchi tovarlar)
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
    setSwapPrice(list > 0 ? String(list) : '');
  };
  const swapTotal = Number(swapPrice);
  const swapCalc = swapOn && picked && swapPrice !== ''
    ? computeProductSwap({
      totalAmount: p.totalAmount, paidAmount: p.paidAmount, remainingAmount: p.remainingAmount,
      paymentType: p.paymentType, status: 'partial', bank: p.bank, downPayment: p.downPayment,
    }, swapTotal, settle)
    : null;
  const swap = swapCalc?.ok ? swapCalc.calc : null;
  const swapping = swapOn && !!picked;

  const showPrice = p.canEditPrice && !p.priceLocked && !swapping;
  const newTotal = Number(price);
  const calc = showPrice && price !== '' && newTotal !== p.totalAmount
    ? computePriceEdit({
      totalAmount: p.totalAmount, paidAmount: p.paidAmount, remainingAmount: p.remainingAmount,
      paymentType: p.paymentType, status: 'partial', downPayment: p.downPayment,
    }, newTotal)
    : null;
  const preview = calc?.ok ? calc.calc : null;
  const remainingAfter = swap ? swap.newRemaining : preview ? preview.newRemaining : p.remainingAmount;
  // Qarz muddati — qarz yoki qoldiqli naqd sotuvda (nasiyada — jadval, bankda — bank)
  const showDue = (p.paymentType === 'debt' || p.paymentType === 'cash') && (remainingAfter > 0 || p.dueDate !== '');
  const customerRequired = p.paymentType !== 'cash' || remainingAfter > 0;
  const customerChanged = customer.id !== cid || customer.name !== cname || customer.phone !== cphone;
  // Narx oshib qoldiq paydo bo'lsa — mijoz shart
  useEffect(() => { if (customerRequired) setCustOn(true); }, [customerRequired]);

  return (
    <section className="sl-card" id="tahrir" aria-labelledby="sl-edit-h">
      <div className="sl-card-head">
        <h2 id="sl-edit-h">{t.title}</h2>
        <button type="button" className="btn btn-ghost btn-sm btn-with-icon" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="sl-edit-form">
          <Icon name={open ? 'close' : 'edit'} size={15} />
          {open ? t.close : t.open}
        </button>
      </div>
      {open && (
        <form id="sl-edit-form" action={formAction} className="sl-payform">
          <input type="hidden" name="saleId" value={p.saleId} />
          {state?.error && <div className="auth-alert auth-alert--error">{state.error}</div>}
          <p className="sl-return-text">{t.text}</p>

          {/* customerOn: mijoz faqat o'zgartirilganda yuboriladi; blok yopilgan bo'lsa — mijoz olib tashlanadi */}
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

          {/* Tovarni almashtirish — farq: hozir to'lanadi / qarzga / qaytariladi (lib/saleEdit computeProductSwap) */}
          <div className="auth-field">
            <span className="sl-pm-l">{t.product}</span>
            {p.swapBlocked ? (
              <small className="sl-edit-hint">{t.productMarked}</small>
            ) : !swapOn ? (
              <button type="button" className="btn btn-tinted btn-sm btn-with-icon" onClick={() => setSwapOn(true)} disabled={isPending}>
                <Icon name="edit" size={14} />
                {t.productChange}
              </button>
            ) : (
              <>
                {picked ? (
                  <div className="sl-edit-cust">
                    <span><b>{picked.name}</b>{picked.imei ? ` · ${picked.imei}` : ''}</span>
                    <button type="button" className="btn btn-ghost btn-sm btn-with-icon sl-edit-cust-x" onClick={() => setPicked(null)} disabled={isPending}>
                      <Icon name="close" size={14} />
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
                <button type="button" className="btn btn-ghost btn-sm btn-with-icon" onClick={() => { setSwapOn(false); setPicked(null); }} disabled={isPending}>
                  <Icon name="close" size={14} />
                  {t.productKeep}
                </button>
              </>
            )}
          </div>

          {swapping && picked && (
            <>
              <input type="hidden" name="productId" value={picked.id} />
              <input type="hidden" name="settle" value={swap && !swap.canDebt ? 'now' : settle} />
              <small className="sl-edit-hint">{tr(t.productHint, { n: qtyWithUnit(swapQty, p.saleUnit, d.stock.fields.units) })}</small>
              <div className="auth-field">
                <label htmlFor="edit-swap-price">{t.swapPrice}</label>
                {p.canEditPrice ? (
                  <PriceInput id="edit-swap-price" name="totalAmount" required disabled={isPending} value={swapPrice} onValueChange={setSwapPrice} />
                ) : (
                  <input id="edit-swap-price" value={swapPrice ? fmtMoney(swapTotal) : ''} readOnly />
                )}
                <small className="sl-edit-hint">{t.swapPriceHint}</small>
              </div>

              {swap && (
                <div className={`sl-remain-box sl-swap-box${swap.refundAmount > 0 ? " sl-remain-box--out" : ""}`} role="status" aria-label={t.swapTitle}>
                  <ul className="sl-swap-rows">
                    <li><span>{t.swapOld}</span><b>{fmtMoney(p.totalAmount)}</b></li>
                    <li><span>{t.swapNew}</span><b>{fmtMoney(swap.newTotal)}</b></li>
                    <li><span>{t.swapPaid}</span><b>{fmtMoney(p.paidAmount)}</b></li>
                    {p.bank > 0 && <li><span>{t.swapBank}</span><b>{fmtMoney(p.bank)}</b></li>}
                    {p.paymentType !== 'bank_credit' && p.remainingAmount > 0 && <li><span>{t.swapDebt}</span><b>{fmtMoney(p.remainingAmount)}</b></li>}
                  </ul>
                  <strong>
                    {swap.delta === 0 ? t.swapEven
                      : swap.collectNow > 0 ? tr(t.swapCollect, { sum: fmtMoney(swap.collectNow) })
                      : swap.addedToDebt > 0 ? tr(t.swapToDebt, { sum: fmtMoney(swap.addedToDebt), rest: fmtMoney(swap.newRemaining) })
                      : swap.refundAmount > 0 ? tr(t.swapRefund, { sum: fmtMoney(swap.refundAmount) })
                      : tr(t.swapDebtDown, { sum: fmtMoney(swap.newRemaining) })}
                  </strong>
                  {swap.refundAmount > 0 && swap.debtReduced > 0 && <span>{tr(t.swapDebtDown, { sum: fmtMoney(swap.newRemaining) })}</span>}
                </div>
              )}
              {swapCalc && !swapCalc.ok && (
                <div className="auth-alert auth-alert--error">
                  {swapCalc.error === 'belowBank' ? d.sales.actions.editBelowBank
                    : swapCalc.error === 'belowDown' ? d.sales.actions.editBelowDown
                    : d.sales.actions.editBadAmount}
                </div>
              )}

              {swap && swap.delta > 0 && (swap.canDebt ? (
                <div className="sl-payform-quick" role="group" aria-label={t.swapTitle}>
                  <button type="button" className="sl-quick" aria-pressed={settle === 'now'} onClick={() => setSettle('now')} disabled={isPending}>{t.settleNow}</button>
                  <button type="button" className="sl-quick" aria-pressed={settle === 'debt'} onClick={() => setSettle('debt')} disabled={isPending}>
                    {p.paymentType === 'installment' ? t.settleInstallment : t.settleDebt}
                  </button>
                </div>
              ) : (
                <small className="sl-edit-hint">{t.settleBankOnly}</small>
              ))}
              {swap && swap.collectNow > 0 && <PayMethodPicker value={method} onChange={setMethod} disabled={isPending} name="method" />}
            </>
          )}

          <div className="auth-field">
            <label htmlFor="edit-notes">{t.notes}</label>
            <textarea id="edit-notes" name="notes" rows={2} maxLength={500} defaultValue={p.notes} disabled={isPending} placeholder={t.notesPh} />
          </div>

          {showDue && (
            <div className="auth-field">
              <input type="hidden" name="dueOn" value="1" />
              <label htmlFor="edit-due">{t.dueDate}</label>
              <input id="edit-due" name="dueDate" type="date" defaultValue={p.dueDate} disabled={isPending} />
            </div>
          )}

          {showPrice ? (
            <div className="auth-field">
              <label htmlFor="edit-price">{t.price}</label>
              <PriceInput id="edit-price" name="totalAmount" required disabled={isPending} value={price} onValueChange={setPrice} />
              <small className="sl-edit-hint">{t.priceHint}{p.paymentType === 'installment' ? ` ${t.priceInstallment}` : ''}</small>
            </div>
          ) : !swapping && (
            <p className="sl-edit-hint">{p.priceLocked ? t.priceLocked : t.priceNoPerm}</p>
          )}

          {preview && (
            <div className={`sl-remain-box${preview.refundAmount > 0 ? ' sl-remain-box--out' : ''}`} role="status">
              <span>
                {preview.refundAmount > 0
                  ? tr(t.previewRefund, { sum: fmtMoney(preview.refundAmount) })
                  : preview.delta > 0
                    ? tr(t.previewUp, { sum: fmtMoney(preview.newRemaining), delta: fmtMoney(preview.delta) })
                    : tr(t.previewDebt, { sum: fmtMoney(preview.newRemaining) })}
              </span>
            </div>
          )}
          {calc && !calc.ok && calc.error !== 'same' && (
            <div className="auth-alert auth-alert--error">
              {calc.error === 'belowDown' ? d.sales.actions.editBelowDown : d.sales.actions.editBadAmount}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={isPending || (calc !== null && !calc.ok && calc.error !== 'same') || (swapOn && (!picked || !swap))}
            onClick={(e) => {
              const refund = swap ? swap.refundAmount : preview?.refundAmount ?? 0;
              if (refund > 0 && !confirm(tr(t.confirmRefund, { sum: fmtMoney(refund) }))) e.preventDefault();
              else if (swap && swap.collectNow > 0 && !confirm(tr(t.confirmCollect, { sum: fmtMoney(swap.collectNow) }))) e.preventDefault();
            }}
          >
            {isPending ? t.pending : t.save}
          </button>
        </form>
      )}
    </section>
  );
}
