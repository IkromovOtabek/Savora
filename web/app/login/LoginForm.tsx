'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { loginAction } from '@/app/actions/auth';
import PasswordField from '@/components/auth/PasswordField';
import AuthShell, { AuthAlert } from '@/components/auth/AuthShell';

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
  forgotUrl?: string;
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
  forgotUrl,
}: Props) {
  const [state, formAction, isPending] = useActionState(loginAction, null);
  const error = state?.error ?? null;

  return (
    <AuthShell title={title} subtitle={subtitle || undefined}>
      {blocked && <AuthAlert tone="warn">Do&apos;kon obunasi to&apos;xtatilgan. Platforma egasiga murojaat qiling.</AuthAlert>}
      {welcome && (
        <AuthAlert tone="ok">
          Do&apos;koningiz tayyor!
          {defaultUsername && (
            <> Sizning login: <code>{defaultUsername}</code></>
          )}
        </AuthAlert>
      )}
      {dbError && <AuthAlert tone="error">{dbError}</AuthAlert>}
      {notice && !dbError && <AuthAlert tone="info">{notice}</AuthAlert>}
      {error && <AuthAlert tone="error">{error}</AuthAlert>}

      {canLogin && (
        <form action={formAction} className="au-form">
          {loginZone && <input type="hidden" name="loginZone" value={loginZone} />}
          {tenantSlug && <input type="hidden" name="tenantSlug" value={tenantSlug} />}
          <div className="au-group">
            <div className="au-row">
              <label htmlFor="username">Login</label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Foydalanuvchi nomi"
                required
                autoFocus
                disabled={isPending}
                defaultValue={defaultUsername}
              />
            </div>
            <div className="au-row">
              <label htmlFor="password">Parol</label>
              <PasswordField id="password" name="password" autoComplete="current-password" placeholder="Parolingiz" required disabled={isPending} />
            </div>
          </div>
          <button type="submit" className="au-btn au-btn--filled au-btn--block" disabled={isPending}>
            {isPending ? 'Kirilmoqda…' : 'Kirish'}
          </button>
        </form>
      )}

      {forgotUrl && (
        <div className="au-links">
          <Link href={forgotUrl} className="au-link">Parolni unutdingizmi?</Link>
        </div>
      )}

      <p className="au-foot">Login va parolni do&apos;kon egasi yoki platforma beradi.</p>
    </AuthShell>
  );
}
