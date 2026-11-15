'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { addSalePaymentAction } from '@/app/actions/sales';
import { useToastOnState } from '@/lib/useToastOnState';
import { fmtMoney, fmtDate } from '@/lib/format';
import { InstallmentMonth, INSTALLMENT_STATE_META, leftUpToMonth, spreadShortfall } from '@/lib/installment';
import PriceInput from '@/components/ui/PriceInput';
import PayMethodPicker from '@/components/tenant/PayMethodPicker';
import type { PayMethod } from '@/lib/payMethods';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

/**
 * Nasiya oylari (vertikal timeline) — bosilganda to'lov modali ochiladi (To'liq / Qisman).
 * To'lov bir xil `addSalePaymentAction` orqali qo'shiladi (alohida to'lov formasi yo'q).
 *
 * To'lov doim eng erta to'lanmagan oydan boshlab yopiladi (lib/installment). Shu sababli
 * keyingi oy bosilsa — "shu oygacha" (oradagi oylar bilan birga) to'lov taklif qilinadi;
 * izohni server haqiqiy taqsimotdan yozadi.
 *
 * Qisman to'lov: summa yozilishi bilan oydan qoladigan qism ko'rinadi; «keyingi oylarga bo'lish»
 * yoqilgan bo'lsa (standart) — oy shu summa bilan yopiladi, qoldiq keyingi oylarga teng bo'linadi
 * (server ham xuddi shu `spreadShortfall` bilan hisoblaydi). To'lovdan keyin — chek tugmasi.
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
  const [partialAmount, setPartialAmount] = useState('');
  const [spread, setSpread] = useState(true);
  // Qabul qilingan to'lov (chek uchun) — modal yopilmaydi, «Chek chiqarish» ko'rsatiladi
  const [done, setDone] = useState<{ paymentId?: string } | null>(null);
  const [state, formAction, isPending] = useActionState(addSalePaymentAction, null);
  useToastOnState(state);
  const d = useDict();
  const k = d.sales.installment;

  function close() {
    setOpenMonth(null);
    setPartial(false);
    setMethod('cash');
    setPartialAmount('');
    setSpread(true);
    setDone(null);
  }

  // Muvaffaqiyatli to'lovdan keyin — chek tugmasi (revalidatePath jadvalni yangilaydi)
  useEffect(() => {
    if (state?.success) setDone({ paymentId: state.paymentId });
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

  // Navbatdagi oy — birinchi to'lanmagan oy (ajratib ko'rsatiladi, "To'lash" tugmasi aniq ko'rinadi)
  const nextMonth = schedule.find((m) => !m.paid)?.month;
  // Keyingi oy bosilgan bo'lsa — navbatdagi oydan shu oygacha (to'lov oylar tartibida yopiladi)
  const rangeFrom = openMonth && nextMonth && nextMonth < openMonth.month ? nextMonth : null;
  // "To'liq" summasi — shu oygacha QOLGAN qism (qisman to'langani ayiriladi), sotuv qoldig'idan oshmaydi
  const fullAmount = openMonth ? Math.min(leftUpToMonth(schedule, openMonth.month), remaining) : 0;

  // Qisman to'lov jonli hisobi: to'lov navbatdagi oyga tushadi (server bilan bir xil qoida)
  const nextM = schedule.find((m) => !m.paid && m.left > 0);
  const partialN = Math.max(0, Math.floor(Number(partialAmount) || 0));
  const shortOf = nextM && partialN > 0 && partialN < nextM.left ? nextM.left - partialN : 0;
  const spreadPlan = shortOf > 0 ? spreadShortfall(schedule, partialN) : null;
  const laterCount = spreadPlan ? spreadPlan.to - spreadPlan.from + 1 : 0;

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
                  {m.state === 'partial' ? ` · ${tr(d.sales.installment.paidOfAmount, { paid: fmtMoney(m.paidAmount), amount: fmtMoney(m.amount) })}` : ''}
                  {/* Qisman to'lovda yopilgan oy / qoldiq qo'shilgan oy */}
                  {m.paid && m.amount < m.planned ? ` · ${tr(k.shiftedOut, { sum: fmtMoney(m.planned - m.amount) })}` : ''}
                  {m.amount > m.planned ? ` · ${tr(k.shiftedIn, { sum: fmtMoney(m.amount - m.planned) })}` : ''}
                </span>
              </span>
              <span className="sl-tl-r">
                {/* Qisman to'langan oy — qolgan qismi (to'langan summa ayirilgan) */}
                <strong>{fmtMoney(m.paid ? m.amount : m.left)}</strong>
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
                  aria-label={tr(d.sales.installment.monthAria, { month: m.month, sum: fmtMoney(m.left), state: stateLabel })}
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
              <h3 id="inst-modal-title">
                {rangeFrom
                  ? tr(d.sales.installment.rangePayment, { from: rangeFrom, to: openMonth.month })
                  : tr(d.sales.installment.monthPayment, { month: openMonth.month })}
              </h3>
              <button type="button" className="inst-modal-close" onClick={close} aria-label={d.common.close}><Icon name="close" size={16} /></button>
            </div>

            {done ? (
              <div className="inst-done" role="status">
                <span className="inst-done-ic" aria-hidden><Icon name="check" size={22} strokeWidth={3} /></span>
                <b>{k.paidDone}</b>
                <div className="inst-modal-actions">
                  {done.paymentId && (
                    <Link
                      href={`/app/sales/${saleId}/payment/${done.paymentId}?print=1`}
                      target="_blank"
                      className="btn btn-primary btn-with-icon inst-btn-full"
                    >
                      <Icon name="clipboard" size={16} />
                      {k.printReceipt}
                    </Link>
                  )}
                  <button type="button" className="btn btn-ghost inst-btn-full" onClick={close}>{d.common.close}</button>
                </div>
              </div>
            ) : (
            <>
            <div className="inst-modal-rows">
              <div className="inst-modal-row">
                <span>{d.sales.monthlyPayment}</span>
                <strong>{fmtMoney(openMonth.amount)} {d.common.sum}</strong>
              </div>
              {!rangeFrom && openMonth.paidAmount > 0 && (
                <div className="inst-modal-row">
                  <span>{d.sales.installment.paidThisMonth}</span>
                  <strong style={{ color: 'var(--accent)' }}>{fmtMoney(openMonth.paidAmount)} {d.common.sum}</strong>
                </div>
              )}
              <div className="inst-modal-row">
                <span>{rangeFrom ? tr(d.sales.installment.leftUpTo, { month: openMonth.month }) : d.sales.installment.leftThisMonth}</span>
                <strong>{fmtMoney(fullAmount)} {d.common.sum}</strong>
              </div>
              <div className="inst-modal-row">
                <span>{d.sales.installment.remainingSum}</span>
                <strong style={{ color: 'var(--danger)' }}>{fmtMoney(remaining)} {d.common.sum}</strong>
              </div>
            </div>
            {/* Qisman to'lov oydan kam bo'lsa — pastdagi «qoladi / bo'lish» bloki tushuntiradi */}
            {nextMonth && (rangeFrom || (partial && shortOf === 0)) && <p className="inst-modal-hint">{tr(d.sales.installment.fifoHint, { month: nextMonth })}</p>}

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
                <input type="hidden" name="method" value={method} />
                <input type="hidden" name="spread" value={spreadPlan && spread ? '1' : ''} />
                <label htmlFor="inst-amount">{d.common.amount}</label>
                <PriceInput id="inst-amount" name="amount" required disabled={isPending} placeholder={String(fullAmount)} value={partialAmount} onValueChange={setPartialAmount} />
                {/* Jonli: oydan qancha qoladi va u qayerga ketadi */}
                {shortOf > 0 && nextM && (
                  <div className="inst-short" aria-live="polite">
                    <div className="inst-short-row">
                      <span>{k.leftAfterPay} <small>({tr(d.sales.monthN, { n: nextM.month })})</small></span>
                      <strong>{fmtMoney(shortOf)} {d.common.sum}</strong>
                    </div>
                    {spreadPlan ? (
                      <>
                        <label className="inst-spread">
                          <input type="checkbox" checked={spread} onChange={(e) => setSpread(e.target.checked)} disabled={isPending} />
                          <span>{tr(k.spreadToggle, { sum: fmtMoney(shortOf), n: laterCount })}</span>
                        </label>
                        <p className="inst-short-hint">
                          {spread
                            ? laterCount === 1
                              ? tr(k.spreadOne, { month: spreadPlan.from, sum: fmtMoney(shortOf) })
                              : tr(k.spreadEach, { sum: fmtMoney(spreadPlan.perMonth), month: nextM.month })
                            : k.staysHint}
                        </p>
                      </>
                    ) : (
                      <p className="inst-short-hint">{k.lastMonthHint}</p>
                    )}
                  </div>
                )}
                <div className="inst-partial-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setPartial(false)} disabled={isPending}>
                    {d.common.back}
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isPending || partialN < 1}>
                    {isPending ? '...' : d.sales.installment.pay}
                  </button>
                </div>
              </form>
            )}
            </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
