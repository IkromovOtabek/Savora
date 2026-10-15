'use client';

import { useActionState, useState } from 'react';
import { createDaftarAction } from '@/app/actions/daftar';
import PriceInput from '@/components/ui/PriceInput';
import Icon from '@/components/icons/Icon';

export default function DaftarForm() {
  const [state, formAction, pending] = useActionState(createDaftarAction, null);
  const [type, setType] = useState<'given' | 'taken'>('given');

  return (
    <form action={formAction} className={`cl-card cl-dform cl-dform--${type}`} aria-labelledby="d-form-title">
      <input type="hidden" name="type" value={type} />

      <div className="cl-dform-h">
        <h2 id="d-form-title">Yangi yozuv</h2>
      </div>

      <div className="cl-dseg" role="group" aria-label="Yozuv turi">
        <button type="button" aria-pressed={type === 'given'} className="cl-dseg-btn cl-dseg-btn--given" onClick={() => setType('given')}>
          <Icon name="arrowRight" size={15} /> Qarz berdim
        </button>
        <button type="button" aria-pressed={type === 'taken'} className="cl-dseg-btn cl-dseg-btn--taken" onClick={() => setType('taken')}>
          <Icon name="arrowLeft" size={15} /> Qarz oldim
        </button>
      </div>

      {state?.error && <div className="auth-alert auth-alert--error" role="alert">{state.error}</div>}

      <div className="cl-dform-grid">
        <div className="auth-field">
          <label htmlFor="d-name">{type === 'given' ? 'Kimga berdingiz' : 'Kimdan oldingiz'}</label>
          <input id="d-name" name="personName" placeholder="Masalan: Aziz" required autoComplete="off" />
        </div>
        <div className="auth-field">
          <label htmlFor="d-phone">Telefon</label>
          <input id="d-phone" name="personPhone" type="tel" placeholder="+998 90 123 45 67" inputMode="tel" required />
        </div>
        <div className="auth-field">
          <label htmlFor="d-amount">Summa (so&apos;m)</label>
          <PriceInput id="d-amount" name="amount" placeholder="0" />
        </div>
        <div className="auth-field">
          <label htmlFor="d-due">Qaytarish kuni</label>
          <input id="d-due" name="dueDate" type="date" required />
        </div>
        <div className="auth-field cl-dform-wide">
          <label htmlFor="d-note">Izoh (ixtiyoriy)</label>
          <input id="d-note" name="note" placeholder="Qisqacha izoh" />
        </div>
      </div>

      <button type="submit" className="btn btn-primary btn-full btn-with-icon" disabled={pending}>
        {pending ? 'Saqlanmoqda…' : <><Icon name="plus" size={16} /> Daftarga qo&apos;shish</>}
      </button>
    </form>
  );
}
