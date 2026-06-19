'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { createBranchAction } from '@/app/actions/branches';
import BackLink from '@/components/ui/BackLink';

export default function BranchCreateForm({ compact = false }: { compact?: boolean }) {
  const [state, formAction, isPending] = useActionState(createBranchAction, null);
  useToastOnState(state);

  if (compact) {
    return (
      <form action={formAction} className="form-grid" style={{ marginTop: 12 }}>
        {state?.error && <div className="auth-alert auth-alert--error">{state.error}</div>}
        {state?.success && <div className="auth-alert auth-alert--info">{state.success}</div>}
        <div className="form-row">
          <div className="auth-field">
            <label htmlFor="name">Yangi filial nomi *</label>
            <input id="name" name="name" type="text" required disabled={isPending} placeholder="Masalan: Chilonzor" />
          </div>
          <div className="auth-field">
            <label htmlFor="address">Manzil</label>
            <input id="address" name="address" type="text" disabled={isPending} />
          </div>
          <div className="auth-field" style={{ alignSelf: 'end' }}>
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? '...' : '+ Filial'}
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className="panel panel--narrow">
      <div className="panel-head">
        <h2>Yangi filial</h2>
        <BackLink href="/app/users#filial" className="btn btn-ghost btn-sm">Orqaga</BackLink>
      </div>
      {state?.error && <div className="auth-alert auth-alert--error" style={{ margin: '16px 24px 0' }}>{state.error}</div>}
      <form action={formAction} className="form-grid">
        <div className="auth-field">
          <label htmlFor="name">Filial nomi *</label>
          <input id="name" name="name" type="text" required disabled={isPending} />
        </div>
        <div className="auth-field">
          <label htmlFor="address">Manzil</label>
          <input id="address" name="address" type="text" disabled={isPending} />
        </div>
        <div className="auth-field">
          <label htmlFor="phone">Telefon</label>
          <input id="phone" name="phone" type="tel" disabled={isPending} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={isPending}>Filial yaratish</button>
      </form>
    </div>
  );
}
