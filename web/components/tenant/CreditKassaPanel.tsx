'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  createBankReceiptAction,
  createCreditBankAction,
  deleteBankReceiptAction,
  deleteCreditBankAction,
  toggleCreditBankAction,
} from '@/app/actions/finance';
import { fmtDate, fmtMoney } from '@/lib/format';
import { useToastOnState } from '@/lib/useToastOnState';
import Icon from '@/components/icons/Icon';
import Tilt from '@/components/ui/Tilt';
import MoreMenu from '@/components/ui/MoreMenu';
import PriceInput from '@/components/ui/PriceInput';
import { useDict } from '@/lib/i18n/client';
import { plural, tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/finance.css';

interface BankCard {
  id: string;
  name: string;
  active: boolean;
  /** Sotuvlarda shu bankka yozilgan summa */
  financed: number;
  /** Bankdan olingan pul */
  received: number;
  /** financed − received; manfiy — bank ortiqcha o'tkazgan */
  balance: number;
  salesCount: number;
}

interface ReceiptRow {
  id: string;
  bankName: string;
  amount: number;
  receivedAt: string;
  note: string;
  recordedBy: string;
}

/** <input type="date"> uchun bugungi mahalliy sana */
function todayIso(): string {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

export default function CreditKassaPanel({
  banks,
  totals,
  receipts,
}: {
  banks: BankCard[];
  totals: { financed: number; received: number; balance: number; salesCount: number };
  receipts: ReceiptRow[];
}) {
  const [state, formAction, pending] = useActionState(createCreditBankAction, null);
  const [showForm, setShowForm] = useState(false);
  const d = useDict();
  const k = d.sales.creditKassa;

  return (
    <div className="fn-wallet">
      <section className="fn-hero" aria-label={k.allBanksAria}>
        <div className="fn-hero-top">
          <span className="fn-hero-label">{k.totalAllBanks}</span>
          <span className="fn-hero-chip"><Icon name="building" size={14} /> {d.sales.paymentTypes.bank_credit}</span>
        </div>
        <div>
          <div className="fn-hero-stat-l">{totals.balance < 0 ? k.overpaid : k.bankBalance}</div>
          <div className="fn-hero-value fn-num">{fmtMoney(totals.balance)}<span className="fn-cur">{d.common.sum}</span></div>
        </div>
        <div className="fn-hero-grid">
          <div className="fn-hero-stat">
            <span className="fn-hero-stat-l">{k.financed}</span>
            <span className="fn-hero-stat-v fn-num">{fmtMoney(totals.financed)}</span>
          </div>
          <div className="fn-hero-stat">
            <span className="fn-hero-stat-l">{k.received}</span>
            <span className="fn-hero-stat-v fn-num">{fmtMoney(totals.received)}</span>
          </div>
        </div>
        <Link href="/app/sales?type=bank_credit" className="fn-hero-link">
          {k.creditSalesLink} · {tr(plural(totals.salesCount, d.sales.nSales), { n: totals.salesCount })}
          <Icon name="chevron" size={14} className="fn-r" />
        </Link>
      </section>

      <div className="fn-wallet-side">
        {banks.length > 0 && <ReceiveForm banks={banks} />}

        <h2 className="fn-section-title"><span>{k.banks}</span><span>{tr(d.common.nPcs, { n: banks.length })}</span></h2>

        <div className="fn-grid">
          {banks.map((b, i) => (
            /* Bank kartasi — Wallet pass (3D chuqurlik); xavfli amallar ⋯ menyuda */
            <Tilt
              key={b.id}
              as="article"
              max={5}
              className={`fn-bank fn-bank--${i % 6}${b.active ? '' : ' fn-bank--off'}`}
            >
              <div className="fn-bank-head">
                <h3 className="fn-bank-name">{b.name}</h3>
                {!b.active && <span className="fn-bank-chip">{k.disabled}</span>}
                <span className="fn-emv" aria-hidden="true" />
                <MoreMenu label={tr(k.bankActions, { name: b.name })}>
                  {b.active && (
                    <form action={toggleCreditBankAction} onClick={(e) => e.stopPropagation()}>
                      <input type="hidden" name="bankId" value={b.id} />
                      <input type="hidden" name="active" value="0" />
                      <button type="submit">
                        <Icon name="eye" size={18} /> {k.disableTemp}
                      </button>
                    </form>
                  )}
                  <form
                    action={deleteCreditBankAction}
                    onClick={(e) => e.stopPropagation()}
                    onSubmit={(e) => {
                      if (!window.confirm(tr(k.deleteConfirm, { name: b.name }))) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="bankId" value={b.id} />
                    <button type="submit" className="ux-danger">
                      <Icon name="trash" size={18} /> {k.deleteBank}
                    </button>
                  </form>
                </MoreMenu>
              </div>
              <div className="fn-bank-label">
                {k.balance}
                {b.balance < 0 && <span className="fn-bank-chip fn-bank-chip--warn">{k.overpaid}</span>}
              </div>
              <div className="fn-bank-value fn-num ux-z">{fmtMoney(b.balance)}<span className="fn-cur">{d.common.sum}</span></div>
              <div className="fn-bank-rows">
                <div className="fn-bank-row"><span>{k.financed}</span><b className="fn-num">{fmtMoney(b.financed)}</b></div>
                <div className="fn-bank-row"><span>{k.received}</span><b className="fn-num">{fmtMoney(b.received)}</b></div>
              </div>
              <div className="fn-bank-foot">
                <span className="fn-bank-count fn-num">{tr(plural(b.salesCount, d.sales.nSales), { n: b.salesCount })}</span>
                {!b.active && (
                  <form action={toggleCreditBankAction}>
                    <input type="hidden" name="bankId" value={b.id} />
                    <input type="hidden" name="active" value="1" />
                    <button type="submit" className="fn-bank-btn">{k.enable}</button>
                  </form>
                )}
                <Link href="/app/sales?type=bank_credit" className="fn-bank-btn">{d.common.details}</Link>
              </div>
            </Tilt>
          ))}

          {showForm ? (
            <form action={formAction} className="fn-add-form" aria-label={k.addFormAria}>
              <div className="auth-field">
                <label htmlFor="bankName">{k.bankName}</label>
                <input id="bankName" name="name" type="text" required disabled={pending} placeholder={k.bankNamePh} autoFocus />
              </div>
              {state?.error && <div className="auth-alert auth-alert--error" role="alert">{state.error}</div>}
              {state?.success && <div className="auth-alert auth-alert--info" role="status">{state.success}</div>}
              <div className="fn-add-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={pending}>
                  {d.common.close}
                </button>
                <button type="submit" className="btn btn-primary" disabled={pending}>
                  {pending ? d.common.saving : d.common.save}
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="fn-add" onClick={() => setShowForm(true)}>
              <span className="fn-add-ico"><Icon name="plus" size={22} /></span>
              {k.addBank}
            </button>
          )}
        </div>

        {banks.length === 0 && !showForm && (
          <p className="fn-tile-s" style={{ margin: '0 4px' }}>
            {k.noBanks}
          </p>
        )}

        {banks.length > 0 && (
          <section className="fn-panel" aria-labelledby="fn-rc-h">
            <div className="fn-panel-head">
              <h2 id="fn-rc-h">{k.receiptsTitle}</h2>
              <small>{tr(d.common.nPcs, { n: receipts.length })}</small>
            </div>
            {receipts.length === 0 ? (
              <p className="fn-panel-body fn-tile-s" style={{ margin: 0 }}>{k.receiptsEmpty}</p>
            ) : (
              <ul className="fn-timeline fn-rc-list">
                {receipts.map((r) => (
                  <li key={r.id} className="fn-tl-item">
                    <span className="fn-tl-time">{fmtDate(r.receivedAt).slice(0, 5)}</span>
                    <span className="fn-tl-dot" aria-hidden />
                    <div className="fn-tl-main">
                      <span className="fn-tl-title">{r.bankName}</span>
                      <span className="fn-tl-sub">
                        {fmtDate(r.receivedAt)} · {r.recordedBy}{r.note ? ` · ${r.note}` : ''}
                      </span>
                    </div>
                    <div className="fn-rc-end">
                      <span className="fn-tl-amount">+{fmtMoney(r.amount)}</span>
                      <form
                        action={deleteBankReceiptAction}
                        onSubmit={(e) => {
                          if (!window.confirm(tr(k.receiptDeleteConfirm, { name: r.bankName, sum: fmtMoney(r.amount) }))) e.preventDefault();
                        }}
                      >
                        <input type="hidden" name="receiptId" value={r.id} />
                        <button type="submit" className="fn-rc-del" aria-label={k.receiptDelete} title={k.receiptDelete}>
                          <Icon name="trash" size={16} />
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

/** «Bankdan pul olindi» — bank, summa, sana, izoh */
function ReceiveForm({ banks }: { banks: BankCard[] }) {
  const d = useDict();
  const k = d.sales.creditKassa;
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createBankReceiptAction, null);
  useToastOnState(state);
  const [amount, setAmount] = useState('');
  // Sana faqat brauzerda (server/klient vaqt mintaqasi farqi hydration xatosiga olib kelmasin)
  const [today, setToday] = useState('');
  useEffect(() => { setToday(todayIso()); }, []);

  // Muvaffaqiyatli yozilgach — forma yopiladi, summa tozalanadi
  useEffect(() => {
    if (state?.success) {
      setOpen(false);
      setAmount('');
    }
  }, [state]);

  if (!open) {
    return (
      <button type="button" className="btn btn-primary btn-with-icon fn-rc-open" onClick={() => setOpen(true)}>
        <Icon name="wallet" size={16} /> {k.receiveBtn}
      </button>
    );
  }

  return (
    <form action={action} className="fn-panel fn-rc-form" aria-label={k.receiveFormAria}>
      <div className="fn-panel-head"><h2>{k.receiveTitle}</h2></div>
      <div className="fn-panel-body fn-rc-fields">
        <div className="auth-field">
          <label htmlFor="rcBank">{k.receiveBank}</label>
          <select id="rcBank" name="bankId" required disabled={pending} defaultValue="">
            <option value="" disabled>{d.sales.newSale.selectPlaceholder}</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} — {k.balance.toLowerCase()} {fmtMoney(b.balance)} {d.common.sum}
              </option>
            ))}
          </select>
        </div>
        <div className="auth-field">
          <label htmlFor="rcAmount">{k.receiveAmount}</label>
          <PriceInput id="rcAmount" name="amount" required value={amount} onValueChange={setAmount} disabled={pending} />
        </div>
        <div className="auth-field">
          <label htmlFor="rcDate">{k.receiveDate}</label>
          <input id="rcDate" name="receivedAt" type="date" defaultValue={today} key={today} max={today || undefined} disabled={pending} />
        </div>
        <div className="auth-field">
          <label htmlFor="rcNote">{k.receiveNote}</label>
          <input id="rcNote" name="note" type="text" maxLength={300} placeholder={k.receiveNotePh} disabled={pending} />
        </div>
        {state?.error && <div className="auth-alert auth-alert--error" role="alert">{state.error}</div>}
        <div className="fn-add-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={pending}>
            {d.common.close}
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? d.common.saving : d.common.save}
          </button>
        </div>
      </div>
    </form>
  );
}
