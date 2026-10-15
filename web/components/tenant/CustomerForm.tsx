'use client';

import { useActionState } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { createCustomerAction, updateCustomerAction } from '@/app/actions/customers';
import ImageUploadField from '@/components/ui/ImageUploadField';
import Icon from '@/components/icons/Icon';

interface Props {
  mode: 'create' | 'edit';
  returnTo?: string;
  mediaEnabled?: boolean;
  initial?: { id: string; fullName: string; phone: string; address: string; notes: string; photoUrl?: string };
}

export default function CustomerForm({ mode, initial, returnTo, mediaEnabled }: Props) {
  const action = mode === 'create' ? createCustomerAction : updateCustomerAction;
  const [state, formAction, isPending] = useActionState(action, null);
  useToastOnState(state);

  return (
    <form action={formAction} className="cl-form" aria-label={mode === 'create' ? 'Yangi mijoz' : 'Mijozni tahrirlash'}>
      {mode === 'edit' && initial && <input type="hidden" name="customerId" value={initial.id} />}
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}

      {state?.error && <div className="auth-alert auth-alert--error" role="alert">{state.error}</div>}
      {state?.success && <div className="auth-alert auth-alert--info" role="status">{state.success}</div>}

      <fieldset className="cl-fsec" disabled={isPending}>
        <legend className="cl-fsec-h"><Icon name="user" size={15} /> Asosiy ma&apos;lumot</legend>
        <div className="cl-fsec-body">
          <div className="auth-field">
            <label htmlFor="fullName">To&apos;liq ism *</label>
            <input id="fullName" name="fullName" type="text" required defaultValue={initial?.fullName} autoComplete="name" />
          </div>
          <div className="auth-field">
            <label htmlFor="phone">Telefon *</label>
            <input id="phone" name="phone" type="tel" required defaultValue={initial?.phone} placeholder="+998..." inputMode="tel" autoComplete="tel" />
          </div>
        </div>
      </fieldset>

      <fieldset className="cl-fsec" disabled={isPending}>
        <legend className="cl-fsec-h"><Icon name="map" size={15} /> Qo&apos;shimcha</legend>
        <div className="cl-fsec-body">
          <div className="auth-field">
            <label htmlFor="address">Manzil</label>
            <input id="address" name="address" type="text" defaultValue={initial?.address} autoComplete="street-address" />
          </div>
          <div className="auth-field">
            <label htmlFor="notes">Izoh</label>
            <textarea id="notes" name="notes" rows={3} defaultValue={initial?.notes} className="text-area" />
          </div>
        </div>
      </fieldset>

      {mediaEnabled && (
        <fieldset className="cl-fsec" disabled={isPending}>
          <legend className="cl-fsec-h"><Icon name="camera" size={15} /> Rasm</legend>
          <div className="cl-fsec-body">
            <ImageUploadField defaultValue={initial?.photoUrl} disabled={isPending} />
          </div>
        </fieldset>
      )}

      <div className="cl-form-bar">
        <button type="submit" className="btn btn-primary btn-lg" disabled={isPending}>
          {isPending ? 'Saqlanmoqda...' : mode === 'create' ? 'Mijoz qo\'shish' : 'Saqlash'}
        </button>
      </div>
    </form>
  );
}
