'use client';

import { useActionState } from 'react';
import { deleteCustomerAction } from '@/app/actions/customers';
import { useToastOnState } from '@/lib/useToastOnState';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

/** Mijozni o'chirish (faqat egasi, tarixsiz mijoz) — server ham tekshiradi */
export default function DeleteCustomerBox({ customerId, name, blocked }: { customerId: string; name: string; blocked: boolean }) {
  const [state, formAction, isPending] = useActionState(deleteCustomerAction, null);
  useToastOnState(state);
  const t = useDict().crm.customers.deleteBox;
  return (
    <form action={formAction} className="cl-card cl-danger">
      <input type="hidden" name="customerId" value={customerId} />
      <h2 className="cl-danger-h">{t.title}</h2>
      {state?.error && <div className="auth-alert auth-alert--error" role="alert">{state.error}</div>}
      <p>{blocked ? t.blocked : t.text}</p>
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
