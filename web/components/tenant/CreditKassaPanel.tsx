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
  const activeCount = banks.filter((b) => b.active).length;

  return (
    <div className="fn-page">
      <section className="fn-hero" aria-label="Barcha banklar">
        <div className="fn-hero-top">
          <span className="fn-hero-label">Jami — barcha banklar</span>
          <span className="fn-hero-chip"><Icon name="building" size={14} /> {activeCount} ta faol bank</span>
        </div>
        <div>
          <div className="fn-hero-stat-l">Bankdagi qoldiq</div>
          <div className="fn-hero-value fn-num">{fmtMoney(totals.balance)}<span className="fn-cur">so&apos;m</span></div>
        </div>
        <div className="fn-hero-grid">
          <div className="fn-hero-stat">
            <span className="fn-hero-stat-l">Bank krediti sotuvlar</span>
            <span className="fn-hero-stat-v fn-num">{totals.salesCount} ta</span>
          </div>
        </div>
        <Link href="/app/sales?type=bank_credit" className="fn-hero-link">
          Bank krediti sotuvlari <Icon name="chevron" size={14} className="fn-r" />
        </Link>
      </section>

      <h2 className="fn-section-title"><span>Banklar</span><span>{banks.length} ta</span></h2>

      <div className="fn-grid">
        {banks.map((b, i) => (
          <article
            key={b.id}
            className={`fn-bank fn-bank--${i % 6}${b.active ? '' : ' fn-bank--off'}`}
            aria-label={`${b.name}${b.active ? '' : " (o'chirilgan)"}`}
          >
            <div className="fn-bank-head">
              <span className="fn-bank-name">{b.name}</span>
              {!b.active && <span className="fn-bank-chip">O&apos;chirilgan</span>}
            </div>
            <div className="fn-bank-label">Bankdagi qoldiq</div>
            <div className="fn-bank-value fn-num">{fmtMoney(b.balance)}<span className="fn-cur">so&apos;m</span></div>
            <div className="fn-bank-foot">
              <span className="fn-bank-count fn-num">{b.salesCount} ta sotuv</span>
              {!b.active && (
                <form action={toggleCreditBankAction}>
                  <input type="hidden" name="bankId" value={b.id} />
                  <input type="hidden" name="active" value="1" />
                  <button type="submit" className="fn-bank-btn">Yoqish</button>
                </form>
              )}
              <Link href="/app/sales?type=bank_credit" className="fn-bank-btn">Batafsil</Link>
              <form
                action={deleteCreditBankAction}
                onSubmit={(e) => {
                  if (!window.confirm(`"${b.name}" bankini o'chirasizmi?`)) e.preventDefault();
                }}
              >
                <input type="hidden" name="bankId" value={b.id} />
                <button type="submit" className="fn-bank-btn fn-bank-btn--icon" aria-label={`${b.name} bankini o'chirish`}>
                  <Icon name="trash" size={16} />
                </button>
              </form>
            </div>
          </article>
        ))}

        {showForm ? (
          <form action={formAction} className="fn-add-form" aria-label="Yangi bank qo'shish">
            <div className="auth-field">
              <label htmlFor="bankName">Bank nomi *</label>
              <input id="bankName" name="name" type="text" required disabled={pending} placeholder="Masalan: Birzum" autoFocus />
            </div>
            {state?.error && <div className="auth-alert auth-alert--error" role="alert">{state.error}</div>}
            {state?.success && <div className="auth-alert auth-alert--info" role="status">{state.success}</div>}
            <div className="fn-add-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={pending}>
                Yopish
              </button>
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? 'Saqlanmoqda…' : 'Saqlash'}
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="fn-add" onClick={() => setShowForm(true)}>
            <span className="fn-add-ico"><Icon name="plus" size={22} /></span>
            Bank qo&apos;shish
          </button>
        )}
      </div>

      {banks.length === 0 && !showForm && (
        <p className="fn-tile-s" style={{ margin: '-6px 4px 0' }}>
          Hali bank qo&apos;shilmagan. Bank krediti bilan sotish uchun avval bank qo&apos;shing.
        </p>
      )}
    </div>
  );
}
