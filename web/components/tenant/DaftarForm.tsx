'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { createDaftarAction, deleteDaftarAction } from '@/app/actions/daftar';
import PriceInput from '@/components/ui/PriceInput';
import Icon from '@/components/icons/Icon';

/** Bugundan n kun keyingi sana — `YYYY-MM-DD` (mahalliy vaqt) */
function plusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Tez tanlanadigan qaytarish muddatlari (brauzer sana oynasi ruscha chiqmasligi uchun asosiy yo'l) */
const QUICK_DUE = [
  { days: 7, label: '1 hafta' },
  { days: 14, label: '2 hafta' },
  { days: 30, label: '1 oy' },
  { days: 90, label: '3 oy' },
];

export default function DaftarForm() {
  const [state, formAction, pending] = useActionState(createDaftarAction, null);
  const [type, setType] = useState<'given' | 'taken'>('given');
  const [due, setDue] = useState('');

  return (
    <form id="d-form" action={formAction} className={`cl-card cl-dform cl-dform--${type}`} aria-labelledby="d-form-title">
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
          <input id="d-due" name="dueDate" type="date" required value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div className="cl-dform-wide cl-dquick" role="group" aria-label="Qaytarish muddatini tez tanlash">
          {QUICK_DUE.map((q) => {
            const v = plusDays(q.days);
            return (
              <button key={q.days} type="button" className="cl-dquick-btn" aria-pressed={due === v} onClick={() => setDue(v)}>
                {q.label}
              </button>
            );
          })}
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

/**
 * Daftar yozuvini o'chirish — ikki bosqichli tasdiq (tasodifiy bosishdan himoya).
 * 1-bosish: "O'chirilsinmi?" holatiga o'tadi; 2-bosish: deleteDaftarAction. 5 soniyada o'zi qaytadi.
 */
export function DaftarDeleteButton({ id, name }: { id: string; name: string }) {
  const [armed, setArmed] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const armRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!armed) return;
    confirmRef.current?.focus();
    const t = window.setTimeout(() => setArmed(false), 5000);
    return () => window.clearTimeout(t);
  }, [armed]);

  if (!armed) {
    return (
      <button
        ref={armRef}
        type="button"
        className="btn btn-plain btn-sm cl-del"
        aria-label={`${name}: yozuvni o'chirish`}
        onClick={() => setArmed(true)}
      >
        <Icon name="trash" size={15} />
      </button>
    );
  }

  return (
    <form
      action={deleteDaftarAction}
      className="cl-del-confirm"
      onKeyDown={(e) => {
        if (e.key === 'Escape') { setArmed(false); requestAnimationFrame(() => armRef.current?.focus()); }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button ref={confirmRef} type="submit" className="btn btn-sm cl-del-yes" aria-label={`${name}: o'chirishni tasdiqlash`}>
        O&apos;chirilsinmi?
      </button>
      <button type="button" className="btn btn-plain btn-sm cl-del-no" aria-label="Bekor qilish" onClick={() => setArmed(false)}>
        <Icon name="close" size={15} />
      </button>
    </form>
  );
}
