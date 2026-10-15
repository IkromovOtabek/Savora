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
    <div className="fn-wallet">
      <section className="fn-hero" aria-label="Barcha banklar">
        <div className="fn-hero-top">
          <span className="fn-hero-label">Jami — barcha banklar</span>
          <span className="fn-hero-chip"><Icon name="building" size={14} /> Bank krediti</span>
        </div>
        <div>
          <div className="fn-hero-stat-l">Bankdagi qoldiq</div>
          <div className="fn-hero-value fn-num">{fmtMoney(totals.balance)}<span className="fn-cur">so&apos;m</span></div>
        </div>
        <div className="fn-hero-grid">
          <div className="fn-hero-stat">
            <span className="fn-hero-stat-l">Sotuvlar</span>
            <span className="fn-hero-stat-v fn-num">{totals.salesCount} ta</span>
          </div>
          <div className="fn-hero-stat">
            <span className="fn-hero-stat-l">Faol banklar</span>
            <span className="fn-hero-stat-v fn-num">{activeCount} ta</span>
          </div>
        </div>
        <Link href="/app/sales?type=bank_credit" className="fn-hero-link">
          Bank krediti sotuvlari <Icon name="chevron" size={14} className="fn-r" />
        </Link>
      </section>

      <div className="fn-wallet-side">
        <h2 className="fn-section-title"><span>Banklar</span><span>{banks.length} ta</span></h2>

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
                {!b.active && <span className="fn-bank-chip">O&apos;chirilgan</span>}
                <span className="fn-emv" aria-hidden="true" />
                <MoreMenu label={`${b.name} — amallar`}>
                  {b.active && (
                    <form action={toggleCreditBankAction} onClick={(e) => e.stopPropagation()}>
                      <input type="hidden" name="bankId" value={b.id} />
                      <input type="hidden" name="active" value="0" />
                      <button type="submit">
                        <Icon name="eye" size={18} /> Vaqtincha o&apos;chirish
                      </button>
                    </form>
                  )}
                  <form
                    action={deleteCreditBankAction}
                    onClick={(e) => e.stopPropagation()}
                    onSubmit={(e) => {
                      if (!window.confirm(`"${b.name}" bankini o'chirasizmi?`)) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="bankId" value={b.id} />
                    <button type="submit" className="ux-danger">
                      <Icon name="trash" size={18} /> Bankni o&apos;chirish
                    </button>
                  </form>
                </MoreMenu>
              </div>
              <div className="fn-bank-label">Bankdagi qoldiq</div>
              <div className="fn-bank-value fn-num ux-z">{fmtMoney(b.balance)}<span className="fn-cur">so&apos;m</span></div>
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
              </div>
            </Tilt>
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
          <p className="fn-tile-s" style={{ margin: '0 4px' }}>
            Hali bank qo&apos;shilmagan. Bank krediti bilan sotish uchun avval bank qo&apos;shing.
          </p>
        )}
      </div>
    </div>
  );
}
