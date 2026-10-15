'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { confirmPasswordResetAction, requestPasswordResetAction } from '@/app/actions/auth';

interface Props {
  title: string;
  storeName: string;
  canReset: boolean;
  notice: string;
  tenantSlug?: string;
  loginUrl: string;
}

export default function ForgotForm({ title, storeName, canReset, notice, tenantSlug, loginUrl }: Props) {
  const [state, formAction, isPending] = useActionState(requestPasswordResetAction, null);
  const [confirmState, confirmAction, isConfirming] = useActionState(confirmPasswordResetAction, null);

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Link href="/" className="auth-brand">
          <span className="brand-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 20 L12 6" stroke="var(--ink-1)" /><path d="M12 6 L18 20" stroke="var(--brand)" /></svg>
          </span>
          Savora
        </Link>

        <h1 className="auth-title">{title}</h1>
        {storeName && <p className="auth-subtitle">{storeName}</p>}

        {notice && <div className="auth-alert auth-alert--info">{notice}</div>}
        {state?.error && <div className="auth-alert auth-alert--error">{state.error}</div>}
        {state?.success && !confirmState && <div className="auth-alert auth-alert--info">{state.success}</div>}
        {confirmState?.error && <div className="auth-alert auth-alert--error">{confirmState.error}</div>}
        {confirmState?.success && <div className="auth-alert auth-alert--info">{confirmState.success}</div>}

        {canReset && state?.step === 'code' && confirmState?.step !== 'done' && (
          <form action={confirmAction} className="auth-form">
            {tenantSlug && <input type="hidden" name="tenantSlug" value={tenantSlug} />}
            <input type="hidden" name="username" value={state.username ?? ''} />
            <p className="auth-help" style={{ fontSize: '.85rem', color: 'var(--ink-2)', lineHeight: 1.5 }}>
              Telegram&apos;ga kelgan 6 xonali kodni va yangi parolni kiriting.
            </p>
            <div className="auth-field">
              <label htmlFor="code">Tasdiqlash kodi</label>
              <input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus disabled={isConfirming} />
            </div>
            <div className="auth-field">
              <label htmlFor="newPassword">Yangi parol</label>
              <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={6} required disabled={isConfirming} />
            </div>
            <div className="auth-field">
              <label htmlFor="confirmPassword">Yangi parolni takrorlang</label>
              <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={6} required disabled={isConfirming} />
            </div>
            <button type="submit" className="btn btn-primary auth-submit" disabled={isConfirming}>
              {isConfirming ? 'Saqlanmoqda...' : 'Parolni yangilash'}
            </button>
          </form>
        )}

        {canReset && !state?.step && (
          <form action={formAction} className="auth-form">
            {tenantSlug && <input type="hidden" name="tenantSlug" value={tenantSlug} />}
            <p className="auth-help" style={{ fontSize: '.85rem', color: 'var(--ink-2)', lineHeight: 1.5 }}>
              Loginni kiriting. Bir martalik tasdiqlash kodi do&apos;konning ulangan Telegram&apos;iga yuboriladi.
              Telegram ulanmagan bo&apos;lsa, do&apos;kon admini yoki platforma egasiga murojaat qiling.
            </p>
            <div className="auth-field">
              <label htmlFor="username">Login</label>
              <input id="username" name="username" type="text" autoComplete="username" required autoFocus disabled={isPending} />
            </div>
            <button type="submit" className="btn btn-primary auth-submit" disabled={isPending}>
              {isPending ? 'Yuborilmoqda...' : 'Kod yuborish'}
            </button>
          </form>
        )}

        <p className="auth-foot">
          <Link href={loginUrl} className="cell-link">← Kirish sahifasiga qaytish</Link>
        </p>
      </div>
    </div>
  );
}
