'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import {
  createCreditBankAction,
  deleteCreditBankAction,
  toggleCreditBankAction,
} from '@/app/actions/finance';
import { fmtMoney } from '@/lib/format';

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

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          + Bank qo&apos;shish
        </button>
      </div>

      {showForm && (
        <div className="panel" style={{ marginBottom: 20, maxWidth: 420 }}>
          <form action={formAction} className="form-grid" style={{ padding: '20px 24px' }}>
            {state?.error && <div className="auth-alert auth-alert--error">{state.error}</div>}
            {state?.success && <div className="auth-alert auth-alert--info">{state.success}</div>}
            <div className="auth-field">
              <label htmlFor="bankName">Bank nomi *</label>
              <input id="bankName" name="name" type="text" required disabled={pending} placeholder="Masalan: Birzum" />
            </div>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? '...' : 'Saqlash'}
            </button>
          </form>
        </div>
      )}

      <div className="bank-cards">
        <div className="bank-card bank-card--total">
          <div className="bank-card-title">JAMI (BARCHA BANKLAR)</div>
          <div className="bank-card-stat">
            <span className="bank-card-stat-label">Bankdagi qoldiq</span>
            <strong className="bank-card-stat-value bank-card-stat-value--green">{fmtMoney(totals.balance)} UZS</strong>
          </div>
          <div className="bank-card-stat">
            <span className="bank-card-stat-label">Kredit sotuvlar</span>
            <strong className="bank-card-stat-value">{totals.salesCount} ta</strong>
          </div>
        </div>

        {banks.map((b) => (
          <div key={b.id} className={`bank-card${b.active ? '' : ' bank-card--inactive'}`}>
            <div className="bank-card-head">
              <strong>{b.name}</strong>
              <form action={deleteCreditBankAction}>
                <input type="hidden" name="bankId" value={b.id} />
                <button type="submit" className="bank-card-close" aria-label="O&apos;chirish">×</button>
              </form>
            </div>
            <div className="bank-card-stat">
              <span className="bank-card-stat-label">Bankdagi qoldiq</span>
              <strong className="bank-card-stat-value bank-card-stat-value--green">{fmtMoney(b.balance)} UZS</strong>
            </div>
            <div className="bank-card-stat">
              <span className="bank-card-stat-label">Sotuvlar soni</span>
              <strong className="bank-card-stat-value">{b.salesCount} ta</strong>
            </div>
            <div className="bank-card-foot">
              <Link href="/app/sales?payment=bank_credit">Batafsil →</Link>
              {!b.active && (
                <form action={toggleCreditBankAction} style={{ display: 'inline', marginLeft: 8 }}>
                  <input type="hidden" name="bankId" value={b.id} />
                  <input type="hidden" name="active" value="1" />
                  <button type="submit" className="btn btn-ghost btn-sm">Yoqish</button>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
