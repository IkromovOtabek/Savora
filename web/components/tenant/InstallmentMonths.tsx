'use client';

import { useActionState, useEffect, useState } from 'react';
import { addSalePaymentAction } from '@/app/actions/sales';
import { useToastOnState } from '@/lib/useToastOnState';
import { fmtMoney, fmtDate } from '@/lib/format';
import { InstallmentMonth, INSTALLMENT_STATE_META } from '@/lib/installment';
import PriceInput from '@/components/ui/PriceInput';
import Icon from '@/components/icons/Icon';

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
  const [state, formAction, isPending] = useActionState(addSalePaymentAction, null);
  useToastOnState(state);

  function close() {
    setOpenMonth(null);
    setPartial(false);
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

  return (
    <>
      <ol className="sl-tl" aria-label="Oylik to'lovlar">
        {schedule.map((m) => {
          const clickable = canPay && !m.paid;
          const meta = INSTALLMENT_STATE_META[m.state];
          const pct = m.amount > 0 ? Math.min(100, Math.round((m.paidAmount / m.amount) * 100)) : 0;
          const inner = (
            <>
              <span className="sl-tl-t">
                <b>{m.month}-oy</b>
                <span>
                  {fmtDate(m.dueDate)}
                  {m.state === 'partial' ? ` · to'landi ${fmtMoney(m.paidAmount)}` : ''}
                </span>
              </span>
              <span className="sl-tl-r">
                <strong>{fmtMoney(m.amount)}</strong>
                {clickable
                  ? <span className="sl-tl-cta">To&apos;lash →</span>
                  : <span className={`sl-pill ${meta.cls}`}>{meta.label}</span>}
              </span>
              {m.state === 'partial' && <span className="sl-tl-mini" aria-hidden><i style={{ width: `${pct}%` }} /></span>}
            </>
          );
          return (
            <li key={m.month} className={`sl-tl-item sl-tl-item--${m.state}`}>
              <span className="sl-tl-dot" aria-hidden>
                {m.paid ? <Icon name="check" size={14} strokeWidth={3} /> : m.month}
              </span>
              {clickable ? (
                <button
                  type="button"
                  className="sl-tl-body"
                  onClick={() => { setOpenMonth(m); setPartial(false); }}
                  aria-label={`${m.month}-oy, ${fmtMoney(m.amount)} so'm, ${meta.label} — to'lash`}
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
              <h3 id="inst-modal-title">{openMonth.month}-oy to&apos;lovi</h3>
              <button type="button" className="inst-modal-close" onClick={close} aria-label="Yopish"><Icon name="close" size={16} /></button>
            </div>

            <div className="inst-modal-rows">
              <div className="inst-modal-row">
                <span>Oylik to&apos;lov</span>
                <strong>{fmtMoney(openMonth.amount)} so&apos;m</strong>
              </div>
              {openMonth.paidAmount > 0 && (
                <div className="inst-modal-row">
                  <span>Shu oyga to&apos;langan</span>
                  <strong style={{ color: 'var(--accent)' }}>{fmtMoney(openMonth.paidAmount)} so&apos;m</strong>
                </div>
              )}
              <div className="inst-modal-row">
                <span>Qolgan summa</span>
                <strong style={{ color: 'var(--danger)' }}>{fmtMoney(remaining)} so&apos;m</strong>
              </div>
            </div>

            {state?.error && <div className="rv-error" style={{ margin: '0 22px' }}>{state.error}</div>}

            {!partial ? (
              <div className="inst-modal-actions">
                <form action={formAction}>
                  <input type="hidden" name="saleId" value={saleId} />
                  <input type="hidden" name="amount" value={fullAmount} />
                  <input type="hidden" name="note" value={`${openMonth.month}-oy to'lovi`} />
                  <button type="submit" className="btn btn-primary inst-btn-full" disabled={isPending}>
                    {isPending ? '...' : `To'liq — ${fmtMoney(fullAmount)} so'm`}
                  </button>
                </form>
                <button
                  type="button"
                  className="btn btn-ghost inst-btn-full"
                  onClick={() => setPartial(true)}
                  disabled={isPending}
                >
                  Qisman to&apos;lov
                </button>
              </div>
            ) : (
              <form action={formAction} className="inst-modal-partial">
                <input type="hidden" name="saleId" value={saleId} />
                <input type="hidden" name="note" value={`${openMonth.month}-oy (qisman)`} />
                <label htmlFor="inst-amount">Summa</label>
                <PriceInput id="inst-amount" name="amount" required disabled={isPending} placeholder={String(fullAmount)} />
                <div className="inst-partial-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setPartial(false)} disabled={isPending}>
                    Orqaga
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isPending}>
                    {isPending ? '...' : 'To\'lash'}
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
