'use client';

import { useActionState, useEffect, useState } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { editSaleAction } from '@/app/actions/sales';
import { fmtMoney } from '@/lib/format';
import { computePriceEdit } from '@/lib/saleEdit';
import type { PaymentType } from '@/lib/models/tenant/Sale';
import PriceInput from '@/components/ui/PriceInput';
import CustomerPicker, { type PickedCustomer } from '@/components/tenant/CustomerPicker';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

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
}

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
    if (state?.success) setOpen(false);
  }, [state]);
  const { id: cid, name: cname, phone: cphone } = p.customer;
  useEffect(() => { setCustomer({ id: cid, name: cname, phone: cphone }); setCustOn(!!(cname || cphone) || p.paymentType !== 'cash' || p.remainingAmount > 0); }, [cid, cname, cphone, p.paymentType, p.remainingAmount]);
  useEffect(() => { setPrice(String(p.totalAmount)); }, [p.totalAmount]);

  const showPrice = p.canEditPrice && !p.priceLocked;
  const newTotal = Number(price);
  const calc = showPrice && price !== '' && newTotal !== p.totalAmount
    ? computePriceEdit({
      totalAmount: p.totalAmount, paidAmount: p.paidAmount, remainingAmount: p.remainingAmount,
      paymentType: p.paymentType, status: 'partial', downPayment: p.downPayment,
    }, newTotal)
    : null;
  const preview = calc?.ok ? calc.calc : null;
  const remainingAfter = preview ? preview.newRemaining : p.remainingAmount;
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
          ) : (
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
            disabled={isPending || (calc !== null && !calc.ok && calc.error !== 'same')}
            onClick={(e) => {
              if (preview && preview.refundAmount > 0 && !confirm(tr(t.confirmRefund, { sum: fmtMoney(preview.refundAmount) }))) e.preventDefault();
            }}
          >
            {isPending ? t.pending : t.save}
          </button>
        </form>
      )}
    </section>
  );
}
