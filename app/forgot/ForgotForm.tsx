'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { requestPasswordResetAction } from '@/app/actions/auth';

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
        {state?.success && <div className="auth-alert auth-alert--info">{state.success}</div>}

        {canReset && !state?.success && (
          <form action={formAction} className="auth-form">
            {tenantSlug && <input type="hidden" name="tenantSlug" value={tenantSlug} />}
            <p className="auth-help" style={{ fontSize: '.85rem', color: 'var(--ink-2)', lineHeight: 1.5 }}>
              Loginni kiriting. Yangi vaqtinchalik parol do&apos;konning ulangan Telegram&apos;iga yuboriladi.
              Telegram ulanmagan bo&apos;lsa, do&apos;kon admini yoki platforma egasiga murojaat qiling.
            </p>
            <div className="auth-field">
              <label htmlFor="username">Login</label>
              <input id="username" name="username" type="text" autoComplete="username" required autoFocus disabled={isPending} />
            </div>
            <button type="submit" className="btn btn-primary auth-submit" disabled={isPending}>
              {isPending ? 'Yuborilmoqda...' : 'Yangi parol yuborish'}
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
