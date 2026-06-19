'use client';

import { useActionState } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { updateBranchAction } from '@/app/actions/branches';

interface Props {
  branch: { id: string; name: string; address: string; phone: string; active: boolean };
}

export default function BranchEditForm({ branch }: Props) {
  const [state, formAction, isPending] = useActionState(updateBranchAction, null);
  useToastOnState(state);

  return (
    <form action={formAction} className="form-grid" style={{ paddingTop: 0 }}>
      <input type="hidden" name="branchId" value={branch.id} />
      {state?.error && <div className="auth-alert auth-alert--error">{state.error}</div>}
      {state?.success && <div className="auth-alert auth-alert--info">{state.success}</div>}

      <div className="auth-field">
        <label htmlFor={`name-${branch.id}`}>Filial nomi *</label>
        <input id={`name-${branch.id}`} name="name" type="text" required defaultValue={branch.name} disabled={isPending} />
      </div>
      <div className="auth-field">
        <label htmlFor={`address-${branch.id}`}>Manzil</label>
        <input id={`address-${branch.id}`} name="address" type="text" defaultValue={branch.address} disabled={isPending} />
      </div>
      <div className="auth-field">
        <label htmlFor={`phone-${branch.id}`}>Telefon</label>
        <input id={`phone-${branch.id}`} name="phone" type="tel" defaultValue={branch.phone} disabled={isPending} />
      </div>
      <label className="check-row">
        <input type="checkbox" name="active" defaultChecked={branch.active} disabled={isPending} />
        Faol filial
      </label>
      <button type="submit" className="btn btn-primary btn-sm" disabled={isPending}>
        {isPending ? '...' : 'Saqlash'}
      </button>
    </form>
  );
}
