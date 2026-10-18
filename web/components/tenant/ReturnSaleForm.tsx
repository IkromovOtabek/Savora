'use client';

import { useActionState, useEffect, useState } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { returnSaleItemsAction } from '@/app/actions/sales';
import { fmtMoney } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

/** Qisman qaytarish — faqat bir nechta dona sotilganda (qty > 1) ko'rsatiladi */
export default function ReturnSaleForm({ saleId, qty, totalAmount }: { saleId: string; qty: number; totalAmount: number }) {
  const [state, formAction, isPending] = useActionState(returnSaleItemsAction, null);
  useToastOnState(state);
  const [n, setN] = useState('1');
  const d = useDict();
  const t = d.sales.returnForm;

  useEffect(() => {
    if (state?.success) setN('1');
  }, [state]);

  const num = Number(n);
  const valid = Number.isInteger(num) && num >= 1 && num < qty;
  const value = valid ? Math.round((totalAmount * num) / qty) : 0;

  return (
    <section className="sl-card" aria-labelledby="sl-return-h">
      <div className="sl-card-head"><h2 id="sl-return-h">{t.title}</h2></div>
      <form action={formAction} className="sl-payform">
        <input type="hidden" name="saleId" value={saleId} />
        {state?.error && <div className="auth-alert auth-alert--error">{state.error}</div>}
        {state?.success && <div className="auth-alert auth-alert--info">{state.success}</div>}
        <p className="sl-return-text">{tr(t.text, { qty })}</p>
        <div className="auth-field">
          <label htmlFor="return-qty">{t.qty}</label>
          <input
            id="return-qty"
            name="qty"
            type="number"
            inputMode="numeric"
            min={1}
            max={qty - 1}
            step={1}
            required
            disabled={isPending}
            value={n}
            onChange={(e) => setN(e.target.value)}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="return-reason">{t.reason}</label>
          <input id="return-reason" name="reason" type="text" maxLength={300} disabled={isPending} placeholder={t.reasonPh} />
        </div>
        {valid && (
          <div className="sl-remain-box">
            <span>{tr(t.preview, { sum: fmtMoney(value) })}</span>
          </div>
        )}
        <button
          type="submit"
          className="btn btn-ghost btn-full btn-with-icon"
          disabled={isPending || !valid}
          onClick={(e) => {
            if (!confirm(tr(t.confirm, { n: num }))) e.preventDefault();
          }}
        >
          <Icon name="repeat" size={16} />
          {isPending ? t.pending : t.submit}
        </button>
      </form>
    </section>
  );
}
