'use client';

import { useActionState, useEffect, useState } from 'react';
import { addSalePaymentAction } from '@/app/actions/sales';
import { useToastOnState } from '@/lib/useToastOnState';
import { fmtMoney, fmtDate } from '@/lib/format';
import { InstallmentMonth, INSTALLMENT_STATE_META } from '@/lib/installment';
import PriceInput from '@/components/ui/PriceInput';
import PayMethodPicker from '@/components/tenant/PayMethodPicker';
import type { PayMethod } from '@/lib/payMethods';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

/**
 * Nasiya oylari (vertikal timeline) — bosilganda to'lov modali ochiladi (To'liq / Qisman).
 * To'lov bir xil `addSalePaymentAction` orqali qo'shiladi (alohida to'lov formasi yo'q).
 */
export default function InstallmentMonths({
  saleId,
  schedule,
  remaining,
  canPay,
}: {
  saleId: string;
  schedule: InstallmentMonth[];
  remaining: number;
  canPay: boolean;
}) {
  const [openMonth, setOpenMonth] = useState<InstallmentMonth | null>(null);
  const [partial, setPartial] = useState(false);
  const [method, setMethod] = useState<PayMethod>('cash');
  const [state, formAction, isPending] = useActionState(addSalePaymentAction, null);
  useToastOnState(state);
  const d = useDict();

  function close() {
    setOpenMonth(null);
    setPartial(false);
    setMethod('cash');
  }

  // Muvaffaqiyatli to'lovdan keyin modal yopiladi (revalidatePath sahifani yangilaydi)
  useEffect(() => {
    if (state?.success) close();
  }, [state]);

  // ESC bilan yopish + fon scroll blok
  useEffect(() => {
    if (!openMonth) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [openMonth]);

  // "To'liq" summasi — shu oyning QOLGAN qismi (qisman to'langan bo'lsa ayiriladi), sotuv qoldig'idan oshmaydi
  const monthLeft = openMonth ? Math.max(0, openMonth.amount - openMonth.paidAmount) : 0;
  const fullAmount = Math.min(monthLeft, remaining);
  // Navbatdagi oy — birinchi to'lanmagan oy (ajratib ko'rsatiladi, "To'lash" tugmasi aniq ko'rinadi)
  const nextMonth = schedule.find((m) => !m.paid)?.month;

  return (
    <>
      <ol className="sl-tl" aria-label={d.sales.installment.monthsAria}>
        {schedule.map((m) => {
          const clickable = canPay && !m.paid;
          const isNext = m.month === nextMonth;
          const meta = INSTALLMENT_STATE_META[m.state];
          const stateLabel = d.sales.installmentState[m.state];
          const pct = m.amount > 0 ? Math.min(100, Math.round((m.paidAmount / m.amount) * 100)) : 0;
          const inner = (
            <>
              <span className="sl-tl-t">
                <b>{tr(d.sales.monthN, { n: m.month })}{isNext && <em className="sl-tl-next">{d.sales.installment.nextTag}</em>}</b>
                <span>
                  {fmtDate(m.dueDate)}
                  {m.state === 'partial' ? ` · ${tr(d.sales.installment.paidPart, { sum: fmtMoney(m.paidAmount) })}` : ''}
                </span>
              </span>
              <span className="sl-tl-r">
                <strong>{fmtMoney(m.amount)}</strong>
                {clickable
                  ? <span className={`sl-tl-cta${isNext ? ' sl-tl-cta--main' : ''}`}>{d.sales.installment.pay}{isNext ? '' : ' →'}</span>
                  : <span className={`sl-pill ${meta.cls}`}>{stateLabel}</span>}
              </span>
              {m.state === 'partial' && <span className="sl-tl-mini" aria-hidden><i style={{ width: `${pct}%` }} /></span>}
            </>
          );
          return (
            <li key={m.month} className={`sl-tl-item sl-tl-item--${m.state}${isNext ? ' sl-tl-item--next' : ''}`} aria-current={isNext ? 'step' : undefined}>
              <span className="sl-tl-dot" aria-hidden>
                {m.paid ? <Icon name="check" size={14} strokeWidth={3} /> : m.month}
              </span>
              {clickable ? (
                <button
                  type="button"
                  className="sl-tl-body"
                  onClick={() => { setOpenMonth(m); setPartial(false); }}
                  aria-label={tr(d.sales.installment.monthAria, { month: m.month, sum: fmtMoney(m.amount), state: stateLabel })}
                >
                  {inner}
                </button>
              ) : (
                <div className="sl-tl-body">{inner}</div>
              )}
            </li>
          );
        })}
      </ol>

      {openMonth && (
        <div className="rv-overlay" onClick={close}>
          <div className="rv-modal inst-modal" role="dialog" aria-modal="true" aria-labelledby="inst-modal-title" onClick={(e) => e.stopPropagation()}>
            <div className="inst-modal-head">
              <h3 id="inst-modal-title">{tr(d.sales.installment.monthPayment, { month: openMonth.month })}</h3>
              <button type="button" className="inst-modal-close" onClick={close} aria-label={d.common.close}><Icon name="close" size={16} /></button>
            </div>

            <div className="inst-modal-rows">
              <div className="inst-modal-row">
                <span>{d.sales.monthlyPayment}</span>
                <strong>{fmtMoney(openMonth.amount)} {d.common.sum}</strong>
              </div>
              {openMonth.paidAmount > 0 && (
                <div className="inst-modal-row">
                  <span>{d.sales.installment.paidThisMonth}</span>
                  <strong style={{ color: 'var(--accent)' }}>{fmtMoney(openMonth.paidAmount)} {d.common.sum}</strong>
                </div>
              )}
              <div className="inst-modal-row">
                <span>{d.sales.installment.remainingSum}</span>
                <strong style={{ color: 'var(--danger)' }}>{fmtMoney(remaining)} {d.common.sum}</strong>
              </div>
            </div>

            {state?.error && <div className="rv-error" style={{ margin: '0 22px' }}>{state.error}</div>}

            <div className="inst-modal-method">
              <PayMethodPicker value={method} onChange={setMethod} disabled={isPending} />
            </div>

            {!partial ? (
              <div className="inst-modal-actions">
                <form action={formAction}>
                  <input type="hidden" name="saleId" value={saleId} />
                  <input type="hidden" name="amount" value={fullAmount} />
                  <input type="hidden" name="method" value={method} />
                  <input type="hidden" name="note" value={`${openMonth.month}-oy to'lovi`} />
                  <button type="submit" className="btn btn-primary inst-btn-full" disabled={isPending}>
                    {isPending ? '...' : tr(d.sales.installment.fullPay, { sum: fmtMoney(fullAmount) })}
                  </button>
                </form>
                <button
                  type="button"
                  className="btn btn-ghost inst-btn-full"
                  onClick={() => setPartial(true)}
                  disabled={isPending}
                >
                  {d.sales.installment.partialPay}
                </button>
              </div>
            ) : (
              <form action={formAction} className="inst-modal-partial">
                <input type="hidden" name="saleId" value={saleId} />
                <input type="hidden" name="note" value={`${openMonth.month}-oy (qisman)`} />
                <input type="hidden" name="method" value={method} />
                <label htmlFor="inst-amount">{d.common.amount}</label>
                <PriceInput id="inst-amount" name="amount" required disabled={isPending} placeholder={String(fullAmount)} />
                <div className="inst-partial-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setPartial(false)} disabled={isPending}>
                    {d.common.back}
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isPending}>
                    {isPending ? '...' : d.sales.installment.pay}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
