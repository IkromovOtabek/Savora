'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { loginAction } from '@/app/actions/auth';
import PasswordField from '@/components/auth/PasswordField';

interface Props {
  title: string;
  subtitle: string;
  canLogin: boolean;
  notice: string;
  dbError?: string;
  blocked: boolean;
  welcome?: boolean;
  defaultUsername?: string;
  loginZone?: 'super' | 'tenant';
  tenantSlug?: string;
}

export default function LoginForm({
  title,
  subtitle,
  canLogin,
  notice,
  dbError,
  blocked,
  welcome,
  defaultUsername,
  loginZone,
  tenantSlug,
}: Props) {
  const [state, formAction, isPending] = useActionState(loginAction, null);
  const error = state?.error ?? null;

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
        {subtitle && <p className="auth-subtitle">{subtitle}</p>}

        {blocked && <div className="auth-alert auth-alert--warn">Do&apos;kon obunasi to&apos;xtatilgan. Platforma egasiga murojaat qiling.</div>}
        {welcome && (
          <div className="auth-alert auth-alert--info">
            Do&apos;koningiz tayyor!
            {defaultUsername && (
              <> Sizning login: <code>{defaultUsername}</code></>
            )}
          </div>
        )}
        {dbError && <div className="auth-alert auth-alert--error">{dbError}</div>}
        {notice && !dbError && <div className="auth-alert auth-alert--info">{notice}</div>}
        {error && <div className="auth-alert auth-alert--error">{error}</div>}

        {canLogin && (
          <form action={formAction} className="auth-form">
            {loginZone && <input type="hidden" name="loginZone" value={loginZone} />}
            {tenantSlug && <input type="hidden" name="tenantSlug" value={tenantSlug} />}
            <div className="auth-field">
              <label htmlFor="username">Login</label>
              <input id="username" name="username" type="text" autoComplete="username" required autoFocus disabled={isPending} defaultValue={defaultUsername} />
            </div>
            <div className="auth-field">
              <label htmlFor="password">Parol</label>
              <PasswordField id="password" name="password" autoComplete="current-password" required disabled={isPending} />
            </div>
            <button type="submit" className="btn btn-primary auth-submit" disabled={isPending}>
              {isPending ? 'Kirilmoqda...' : 'Kirish'}
            </button>
          </form>
        )}

        <p className="auth-foot">Login va parolni do&apos;kon egasi yoki platforma beradi.</p>
      </div>
    </div>
  );
}
