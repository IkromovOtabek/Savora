'use client';

import { useActionState, useEffect, useState } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { returnSaleItemsAction } from '@/app/actions/sales';
import { fmtMoney } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { qtyWithUnit, tr } from '@/lib/i18n/fmt';
import { isFractionalUnit, parseQty } from '@/lib/qty';
import type { ProductUnit } from '@/lib/businessTypes';

/** Qisman qaytarish — bir nechta dona (qty > 1) yoki kasrli birlikda (1,5 kg dan 0,5 kg) */
export default function ReturnSaleForm({ saleId, qty, unit, totalAmount }: { saleId: string; qty: number; unit: ProductUnit | null; totalAmount: number }) {
  const [state, formAction, isPending] = useActionState(returnSaleItemsAction, null);
  useToastOnState(state);
  const [n, setN] = useState('1');
  const d = useDict();
  const t = d.sales.returnForm;

  useEffect(() => {
    if (state?.success) setN('1');
  }, [state]);

  const fractional = isFractionalUnit(unit);
  const num = parseQty(n, unit);
  const valid = num !== null && num < qty;
  // Server (computePartialReturn) bilan bir xil: 0.001 birlikda butun arifmetika
  const value = valid ? Math.round((totalAmount * Math.round(num * 1000)) / Math.round(qty * 1000)) : 0;
  const units = d.stock.fields.units;

  return (
    <section className="sl-card" aria-labelledby="sl-return-h">
      <div className="sl-card-head"><h2 id="sl-return-h">{t.title}</h2></div>
      <form action={formAction} className="sl-payform">
        <input type="hidden" name="saleId" value={saleId} />
        {state?.error && <div className="auth-alert auth-alert--error">{state.error}</div>}
        {state?.success && <div className="auth-alert auth-alert--info">{state.success}</div>}
        <p className="sl-return-text">{tr(t.text, { qty: qtyWithUnit(qty, unit, units) })}</p>
        <div className="auth-field">
          <label htmlFor="return-qty">{t.qty}{fractional && unit ? ` (${units[unit]})` : ''}</label>
          {fractional ? (
            <input
              id="return-qty"
              name="qty"
              type="text"
              inputMode="decimal"
              required
              disabled={isPending}
              value={n}
              onChange={(e) => setN(e.target.value.replace(/[^\d.,]/g, ''))}
              aria-invalid={(n.trim() !== '' && !valid) || undefined}
            />
          ) : (
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
          )}
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
            if (!confirm(tr(t.confirm, { n: qtyWithUnit(num ?? 0, unit, units) }))) e.preventDefault();
          }}
        >
          <Icon name="repeat" size={16} />
          {isPending ? t.pending : t.submit}
        </button>
      </form>
    </section>
  );
}
