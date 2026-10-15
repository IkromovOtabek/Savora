'use client';

import { useActionState, useEffect, useState } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { addSalePaymentAction } from '@/app/actions/sales';
import { fmtMoney } from '@/lib/format';
import PriceInput from '@/components/ui/PriceInput';

export default function SalePaymentForm({ saleId, remaining }: { saleId: string; remaining: number }) {
  const [state, formAction, isPending] = useActionState(addSalePaymentAction, null);
  useToastOnState(state);
  const [amount, setAmount] = useState('');

  // Muvaffaqiyatli to'lovdan keyin maydon tozalanadi
  useEffect(() => {
    if (state?.success) setAmount('');
  }, [state]);

  const half = Math.round(remaining / 2);

  return (
    <section className="sl-card" aria-labelledby="sl-payform-h">
      <div className="sl-card-head"><h2 id="sl-payform-h">To&apos;lov qabul qilish</h2></div>
      <form action={formAction} className="sl-payform">
        <input type="hidden" name="saleId" value={saleId} />
        {state?.error && <div className="auth-alert auth-alert--error">{state.error}</div>}
        {state?.success && <div className="auth-alert auth-alert--info">{state.success}</div>}
        <div className="sl-remain-box">
          <span>Qoldiq qarz</span>
          <strong>{fmtMoney(remaining)} so&apos;m</strong>
        </div>
        <div className="auth-field">
          <label htmlFor="amount">Summa *</label>
          <PriceInput id="amount" name="amount" required disabled={isPending} placeholder={String(remaining)} value={amount} onValueChange={setAmount} />
        </div>
        <div className="sl-payform-quick" role="group" aria-label="Tez summa">
          <button type="button" className="sl-quick" onClick={() => setAmount(String(remaining))} disabled={isPending}>
            To&apos;liq: {fmtMoney(remaining)}
          </button>
          {half > 0 && half < remaining && (
            <button type="button" className="sl-quick" onClick={() => setAmount(String(half))} disabled={isPending}>
              Yarmi: {fmtMoney(half)}
            </button>
          )}
        </div>
        <div className="auth-field">
          <label htmlFor="note">Izoh</label>
          <input id="note" name="note" type="text" disabled={isPending} placeholder="Masalan: 2-chi to'lov" />
        </div>
        <button type="submit" className="btn btn-primary btn-full" disabled={isPending}>
          {isPending ? 'Saqlanmoqda...' : 'To\'lovni qabul qilish'}
        </button>
      </form>
    </section>
  );
}
