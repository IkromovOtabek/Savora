'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { createCustomerAction, updateCustomerAction } from '@/app/actions/customers';
import BackLink from '@/components/ui/BackLink';
import ImageUploadField from '@/components/ui/ImageUploadField';

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
    <div className="panel panel--narrow">
      <div className="panel-head">
        <h2>{mode === 'create' ? 'Yangi mijoz' : 'Mijozni tahrirlash'}</h2>
        <BackLink href="/app/customers" className="btn btn-ghost btn-sm">Orqaga</BackLink>
      </div>

      {state?.error && <div className="auth-alert auth-alert--error" style={{ margin: '16px 24px 0' }}>{state.error}</div>}
      {state?.success && <div className="auth-alert auth-alert--info" style={{ margin: '16px 24px 0' }}>{state.success}</div>}

      <form action={formAction} className="form-grid">
        {mode === 'edit' && initial && <input type="hidden" name="customerId" value={initial.id} />}
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}

        <div className="auth-field">
          <label htmlFor="fullName">To&apos;liq ism *</label>
          <input id="fullName" name="fullName" type="text" required defaultValue={initial?.fullName} disabled={isPending} />
        </div>
        <div className="auth-field">
          <label htmlFor="phone">Telefon *</label>
          <input id="phone" name="phone" type="tel" required defaultValue={initial?.phone} disabled={isPending} placeholder="+998..." />
        </div>
        <div className="auth-field">
          <label htmlFor="address">Manzil</label>
          <input id="address" name="address" type="text" defaultValue={initial?.address} disabled={isPending} />
        </div>
        {mediaEnabled && (
          <div className="auth-field">
            <label>Rasm</label>
            <ImageUploadField defaultValue={initial?.photoUrl} disabled={isPending} />
          </div>
        )}
        <div className="auth-field">
          <label htmlFor="notes">Izoh</label>
          <textarea id="notes" name="notes" rows={3} defaultValue={initial?.notes} disabled={isPending} className="text-area" />
        </div>

        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? 'Saqlanmoqda...' : mode === 'create' ? 'Mijoz qo\'shish' : 'Saqlash'}
        </button>
      </form>
    </div>
  );
}
