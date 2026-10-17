'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import {
  createCreditBankAction,
  deleteCreditBankAction,
  toggleCreditBankAction,
} from '@/app/actions/finance';
import { fmtMoney } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import Tilt from '@/components/ui/Tilt';
import MoreMenu from '@/components/ui/MoreMenu';
import { useDict } from '@/lib/i18n/client';
import { plural, tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/finance.css';

interface BankCard {
  id: string;
  name: string;
  active: boolean;
  balance: number;
  salesCount: number;
}

export default function CreditKassaPanel({
  banks,
  totals,
}: {
  banks: BankCard[];
  totals: { balance: number; salesCount: number };
}) {
  const [state, formAction, pending] = useActionState(createCreditBankAction, null);
  const [showForm, setShowForm] = useState(false);
  const d = useDict();
  const activeCount = banks.filter((b) => b.active).length;

  return (
    <div className="fn-wallet">
      <section className="fn-hero" aria-label={d.sales.creditKassa.allBanksAria}>
        <div className="fn-hero-top">
          <span className="fn-hero-label">{d.sales.creditKassa.totalAllBanks}</span>
          <span className="fn-hero-chip"><Icon name="building" size={14} /> {d.sales.paymentTypes.bank_credit}</span>
        </div>
        <div>
          <div className="fn-hero-stat-l">{d.sales.creditKassa.bankBalance}</div>
          <div className="fn-hero-value fn-num">{fmtMoney(totals.balance)}<span className="fn-cur">{d.common.sum}</span></div>
        </div>
        <div className="fn-hero-grid">
          <div className="fn-hero-stat">
            <span className="fn-hero-stat-l">{d.common.sales}</span>
            <span className="fn-hero-stat-v fn-num">{tr(d.common.nPcs, { n: totals.salesCount })}</span>
          </div>
          <div className="fn-hero-stat">
            <span className="fn-hero-stat-l">{d.sales.creditKassa.activeBanks}</span>
            <span className="fn-hero-stat-v fn-num">{tr(d.common.nPcs, { n: activeCount })}</span>
          </div>
        </div>
        <Link href="/app/sales?type=bank_credit" className="fn-hero-link">
          {d.sales.creditKassa.creditSalesLink} <Icon name="chevron" size={14} className="fn-r" />
        </Link>
      </section>

      <div className="fn-wallet-side">
        <h2 className="fn-section-title"><span>{d.sales.creditKassa.banks}</span><span>{tr(d.common.nPcs, { n: banks.length })}</span></h2>

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
                {!b.active && <span className="fn-bank-chip">{d.sales.creditKassa.disabled}</span>}
                <span className="fn-emv" aria-hidden="true" />
                <MoreMenu label={tr(d.sales.creditKassa.bankActions, { name: b.name })}>
                  {b.active && (
                    <form action={toggleCreditBankAction} onClick={(e) => e.stopPropagation()}>
                      <input type="hidden" name="bankId" value={b.id} />
                      <input type="hidden" name="active" value="0" />
                      <button type="submit">
                        <Icon name="eye" size={18} /> {d.sales.creditKassa.disableTemp}
                      </button>
                    </form>
                  )}
                  <form
                    action={deleteCreditBankAction}
                    onClick={(e) => e.stopPropagation()}
                    onSubmit={(e) => {
                      if (!window.confirm(tr(d.sales.creditKassa.deleteConfirm, { name: b.name }))) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="bankId" value={b.id} />
                    <button type="submit" className="ux-danger">
                      <Icon name="trash" size={18} /> {d.sales.creditKassa.deleteBank}
                    </button>
                  </form>
                </MoreMenu>
              </div>
              <div className="fn-bank-label">{d.sales.creditKassa.bankBalance}</div>
              <div className="fn-bank-value fn-num ux-z">{fmtMoney(b.balance)}<span className="fn-cur">{d.common.sum}</span></div>
              <div className="fn-bank-foot">
                <span className="fn-bank-count fn-num">{tr(plural(b.salesCount, d.sales.nSales), { n: b.salesCount })}</span>
                {!b.active && (
                  <form action={toggleCreditBankAction}>
                    <input type="hidden" name="bankId" value={b.id} />
                    <input type="hidden" name="active" value="1" />
                    <button type="submit" className="fn-bank-btn">{d.sales.creditKassa.enable}</button>
                  </form>
                )}
                <Link href="/app/sales?type=bank_credit" className="fn-bank-btn">{d.common.details}</Link>
              </div>
            </Tilt>
          ))}

          {showForm ? (
            <form action={formAction} className="fn-add-form" aria-label={d.sales.creditKassa.addFormAria}>
              <div className="auth-field">
                <label htmlFor="bankName">{d.sales.creditKassa.bankName}</label>
                <input id="bankName" name="name" type="text" required disabled={pending} placeholder={d.sales.creditKassa.bankNamePh} autoFocus />
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
              {d.sales.creditKassa.addBank}
            </button>
          )}
        </div>

        {banks.length === 0 && !showForm && (
          <p className="fn-tile-s" style={{ margin: '0 4px' }}>
            {d.sales.creditKassa.noBanks}
          </p>
        )}
      </div>
    </div>
  );
}
