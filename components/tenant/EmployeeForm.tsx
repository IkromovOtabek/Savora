'use client';

import { useActionState } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { createEmployeeAction, updateEmployeeAction } from '@/app/actions/users';
import BackLink from '@/components/ui/BackLink';

interface Props {
  mode: 'create' | 'edit';
  initial?: { id: string; username: string; fullName: string; role: string; active: boolean };
}

export default function EmployeeForm({ mode, initial }: Props) {
  const action = mode === 'create' ? createEmployeeAction : updateEmployeeAction;
  const [state, formAction, isPending] = useActionState(action, null);
  useToastOnState(state);

  return (
    <div className="panel panel--narrow">
      <div className="panel-head">
        <h2>{mode === 'create' ? 'Yangi foydalanuvchi' : 'Foydalanuvchini tahrirlash'}</h2>
        <BackLink href="/app/users" className="btn btn-ghost btn-sm">Orqaga</BackLink>
      </div>
      {state?.error && <div className="auth-alert auth-alert--error" style={{ margin: '16px 24px 0' }}>{state.error}</div>}
      {state?.success && (
        <div className="auth-alert auth-alert--info" style={{ margin: '16px 24px 0' }}>
          {state.success}
          {state.generatedLogin && state.tempPassword && (
            <div className="cred-created" style={{ marginTop: 10 }}>
              <div><strong>Login:</strong> <code>{state.generatedLogin}</code></div>
              <div><strong>Vaqtinchalik parol:</strong> <code>{state.tempPassword}</code></div>
            </div>
          )}
        </div>
      )}

      <form action={formAction} className="form-grid">
        {mode === 'edit' && initial && <input type="hidden" name="userId" value={initial.id} />}
        {mode === 'create' ? (
          <>
            <div className="auth-field">
              <label htmlFor="fullName">To&apos;liq ism *</label>
              <input id="fullName" name="fullName" type="text" required disabled={isPending} placeholder="Masalan: Ali Valiyev" />
            </div>
            <p className="field-hint">Login avtomatik yaratiladi (ism + tasodifiy raqam). Xodim profildan parolni o&apos;zgartiradi.</p>
          </>
        ) : (
          <>
            <div className="form-meta"><span className="form-meta-l">Login:</span> <code>{initial?.username}</code></div>
            <div className="auth-field">
              <label htmlFor="newPassword">Yangi parol (ixtiyoriy)</label>
              <input id="newPassword" name="newPassword" type="password" minLength={6} disabled={isPending} autoComplete="new-password" />
            </div>
          </>
        )}
        {mode === 'edit' && (
          <div className="auth-field">
            <label htmlFor="fullName">To&apos;liq ism</label>
            <input id="fullName" name="fullName" type="text" defaultValue={initial?.fullName} disabled={isPending} />
          </div>
        )}
        <div className="auth-field">
          <label htmlFor="role">Rol</label>
          <select id="role" name="role" defaultValue={initial?.role ?? 'user'} disabled={isPending}>
            <option value="user">Foydalanuvchi</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {mode === 'edit' && (
          <label className="check-row">
            <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} disabled={isPending} />
            Faol
          </label>
        )}
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? '...' : mode === 'create' ? 'Foydalanuvchi qo\'shish' : 'Saqlash'}
        </button>
      </form>
    </div>
  );
}
