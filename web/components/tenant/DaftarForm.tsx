'use client';

import { useActionState, useState } from 'react';
import { createDaftarAction } from '@/app/actions/daftar';
import PriceInput from '@/components/ui/PriceInput';

export default function DaftarForm() {
  const [state, formAction, pending] = useActionState(createDaftarAction, null);
  const [type, setType] = useState<'given' | 'taken'>('given');

  return (
    <form action={formAction} className="panel" style={{ padding: 18, marginBottom: 20 }}>
      <input type="hidden" name="type" value={type} />

      <div className="daftar-type">
        <button type="button" className={`daftar-type-btn${type === 'given' ? ' daftar-type-btn--active' : ''}`} onClick={() => setType('given')}>
          Qarz berdim
        </button>
        <button type="button" className={`daftar-type-btn${type === 'taken' ? ' daftar-type-btn--active' : ''}`} onClick={() => setType('taken')}>
          Qarz oldim
        </button>
      </div>

      {state?.error && <div className="auth-alert auth-alert--error" style={{ marginTop: 12 }}>{state.error}</div>}

      <div className="form-row" style={{ marginTop: 14 }}>
        <div className="auth-field">
          <label htmlFor="d-name">Ism</label>
          <input id="d-name" name="personName" placeholder="Masalan: Aziz" required />
        </div>
        <div className="auth-field">
          <label htmlFor="d-phone">Telefon</label>
          <input id="d-phone" name="personPhone" placeholder="+998 90 123 45 67" inputMode="tel" required />
        </div>
      </div>

      <div className="form-row">
        <div className="auth-field">
          <label htmlFor="d-amount">Summa (so&apos;m)</label>
          <PriceInput id="d-amount" name="amount" placeholder="0" />
        </div>
        <div className="auth-field">
          <label htmlFor="d-due">Qaytarish kuni</label>
          <input id="d-due" name="dueDate" type="date" required />
        </div>
      </div>

      <div className="auth-field">
        <label htmlFor="d-note">Izoh (ixtiyoriy)</label>
        <input id="d-note" name="note" placeholder="Qisqacha izoh" />
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending} style={{ marginTop: 4 }}>
        {pending ? 'Saqlanmoqda…' : '+ Daftarga qo’shish'}
      </button>
    </form>
  );
}
