'use client';

import { useActionState } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { addSalePaymentAction } from '@/app/actions/sales';
import { fmtMoney } from '@/lib/format';
import PriceInput from '@/components/ui/PriceInput';

export default function SalePaymentForm({ saleId, remaining }: { saleId: string; remaining: number }) {
  const [state, formAction, isPending] = useActionState(addSalePaymentAction, null);
  useToastOnState(state);

  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <div className="panel-head"><h2>To&apos;lov qo&apos;shish</h2></div>
      <form action={formAction} className="form-grid">
        <input type="hidden" name="saleId" value={saleId} />
        {state?.error && <div className="auth-alert auth-alert--error">{state.error}</div>}
        {state?.success && <div className="auth-alert auth-alert--info">{state.success}</div>}
        <p className="field-hint" style={{ margin: 0 }}>Qoldiq: <strong>{fmtMoney(remaining)} so&apos;m</strong></p>
        <div className="form-row">
          <div className="auth-field">
            <label htmlFor="amount">Summa *</label>
            <PriceInput id="amount" name="amount" required disabled={isPending} placeholder={String(remaining)} />
          </div>
          <div className="auth-field">
            <label htmlFor="note">Izoh</label>
            <input id="note" name="note" type="text" disabled={isPending} placeholder="Masalan: 2-chi to'lov" />
          </div>
        </div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={isPending}>
          {isPending ? '...' : 'To\'lov qo\'shish'}
        </button>
      </form>
    </div>
  );
}
