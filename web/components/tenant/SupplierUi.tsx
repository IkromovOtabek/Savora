'use client';

import { useActionState, useEffect, useState } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import {
  createSupplierAction,
  updateSupplierAction,
  deleteSupplierAction,
  addSupplierEntryAction,
  deleteSupplierEntryAction,
} from '@/app/actions/suppliers';
import PriceInput from '@/components/ui/PriceInput';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

type Initial = { id: string; name: string; phone: string; company: string; notes: string };

/** Yetkazib beruvchi formasi (yaratish / tahrirlash) */
export function SupplierForm({ mode, initial }: { mode: 'create' | 'edit'; initial?: Initial }) {
  const [state, formAction, isPending] = useActionState(mode === 'create' ? createSupplierAction : updateSupplierAction, null);
  useToastOnState(state);
  const d = useDict();
  const f = d.stock.suppliers.form;

  return (
    <form action={formAction} className="cl-form" aria-label={mode === 'create' ? f.ariaNew : f.ariaEdit}>
      {mode === 'edit' && initial && <input type="hidden" name="supplierId" value={initial.id} />}
      {state?.error && <div className="auth-alert auth-alert--error" role="alert">{state.error}</div>}
      {state?.success && <div className="auth-alert auth-alert--info" role="status">{state.success}</div>}

      <fieldset className="cl-fsec" disabled={isPending}>
        <legend className="cl-fsec-h"><Icon name="store" size={15} /> {f.main}</legend>
        <div className="cl-fsec-body">
          <div className="auth-field">
            <label htmlFor="sp-name">{f.name}</label>
            <input id="sp-name" name="name" type="text" required maxLength={120} defaultValue={initial?.name} placeholder={f.namePh} />
          </div>
          <div className="auth-field">
            <label htmlFor="sp-phone">{f.phone}</label>
            <input id="sp-phone" name="phone" type="tel" maxLength={40} defaultValue={initial?.phone} placeholder="+998..." inputMode="tel" />
          </div>
          <div className="auth-field">
            <label htmlFor="sp-company">{f.company}</label>
            <input id="sp-company" name="company" type="text" maxLength={120} defaultValue={initial?.company} />
          </div>
          <div className="auth-field">
            <label htmlFor="sp-notes">{f.notes}</label>
            <textarea id="sp-notes" name="notes" rows={3} maxLength={500} defaultValue={initial?.notes} className="text-area" />
          </div>
        </div>
      </fieldset>

      <div className="cl-form-bar">
        <button type="submit" className="btn btn-primary btn-lg" disabled={isPending}>
          {isPending ? d.common.saving : mode === 'create' ? f.submitCreate : d.common.save}
        </button>
      </div>
    </form>
  );
}

/** Hisob-kitob yozuvi: tovar olindi (+qarz) / to'lov qilindi (−qarz) */
export function SupplierEntryForm({ supplierId, debt }: { supplierId: string; debt: number }) {
  const [state, formAction, isPending] = useActionState(addSupplierEntryAction, null);
  useToastOnState(state);
  const [type, setType] = useState<'purchase' | 'payment'>('purchase');
  const [amount, setAmount] = useState('');
  const d = useDict();
  const t = d.stock.suppliers.entry;

  useEffect(() => {
    if (state?.success) setAmount('');
  }, [state]);

  return (
    <form action={formAction} className="cl-card sp-entry-form" aria-labelledby="sp-entry-h">
      <h2 id="sp-entry-h" className="sp-h">{t.title}</h2>
      <input type="hidden" name="supplierId" value={supplierId} />
      <input type="hidden" name="type" value={type} />
      {state?.error && <div className="auth-alert auth-alert--error" role="alert">{state.error}</div>}
      {state?.success && <div className="auth-alert auth-alert--info" role="status">{state.success}</div>}

      <div className="sp-seg" role="radiogroup" aria-label={t.title}>
        {(['purchase', 'payment'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={type === k}
            className={`sp-seg-btn${type === k ? ' is-on' : ''} sp-seg-btn--${k}`}
            onClick={() => setType(k)}
            disabled={isPending || (k === 'payment' && debt <= 0)}
          >
            <b>{t[k]}</b>
            <small>{k === 'purchase' ? t.purchaseHint : t.paymentHint}</small>
          </button>
        ))}
      </div>

      <div className="auth-field">
        <label htmlFor="sp-amount">{t.amount}</label>
        <PriceInput id="sp-amount" name="amount" required disabled={isPending} value={amount} onValueChange={setAmount} placeholder={type === 'payment' && debt > 0 ? String(debt) : ''} />
      </div>
      <div className="auth-field">
        <label htmlFor="sp-note">{t.note}</label>
        <input id="sp-note" name="note" type="text" maxLength={300} disabled={isPending} placeholder={t.notePh} />
      </div>
      <button type="submit" className="btn btn-primary btn-full" disabled={isPending}>
        {isPending ? t.saving : t.submit}
      </button>
    </form>
  );
}

/** Hisob-kitob yozuvini o'chirish (xato kiritilganda) */
export function DeleteSupplierEntryButton({ entryId }: { entryId: string }) {
  const [state, formAction, isPending] = useActionState(deleteSupplierEntryAction, null);
  useToastOnState(state);
  const d = useDict();
  const h = d.stock.suppliers.history;
  return (
    <form action={formAction}>
      <input type="hidden" name="entryId" value={entryId} />
      <button
        type="submit"
        className="sp-entry-del"
        aria-label={h.delete}
        title={h.delete}
        disabled={isPending}
        onClick={(e) => { if (!confirm(h.deleteConfirm)) e.preventDefault(); }}
      >
        <Icon name="trash" size={15} />
      </button>
    </form>
  );
}

export function DeleteSupplierBox({ supplierId, name, blocked }: { supplierId: string; name: string; blocked: boolean }) {
  const [state, formAction, isPending] = useActionState(deleteSupplierAction, null);
  useToastOnState(state);
  const d = useDict();
  const t = d.stock.suppliers.deleteBox;
  return (
    <form action={formAction} className="cl-card sp-danger">
      <input type="hidden" name="supplierId" value={supplierId} />
      <h2 className="sp-h">{t.title}</h2>
      {state?.error && <div className="auth-alert auth-alert--error" role="alert">{state.error}</div>}
      <p className="sp-muted">{t.text}</p>
      <button
        type="submit"
        className="btn btn-danger btn-with-icon"
        disabled={isPending || blocked}
        onClick={(e) => { if (!confirm(tr(t.confirm, { name }))) e.preventDefault(); }}
      >
        <Icon name="trash" size={16} /> {t.btn}
      </button>
    </form>
  );
}
