'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { loginAction } from '@/app/actions/auth';
import PasswordField from '@/components/auth/PasswordField';
import { AuthAlert } from '@/components/auth/AuthShell';
import AnimatedLogo from '@/components/brand/AnimatedLogo';
import Icon from '@/components/icons/Icon';
import LangSwitch from '@/components/LangSwitch';
import { useDict } from '@/lib/i18n/client';
import './login.css';

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
  /** Asosiy saytda — yangi do'kon ochish havolasi */
  showRegister?: boolean;
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
  showRegister,
}: Props) {
  const [state, formAction, isPending] = useActionState(loginAction, null);
  const error = state?.error ?? null;
  // Boshqariladigan qiymat — xato javobidan keyin React forma tozalasa ham login yo'qolmaydi
  const [username, setUsername] = useState(defaultUsername ?? '');
  const d = useDict();
  const t = d.auth.login;

  return (
    <div className="lg">
      <header className="lg-top">
        <Link href="/" className="lg-back">
          <Icon name="arrowLeft" size={16} />
          {d.common.home}
        </Link>
        <LangSwitch compact className="lg-lang" />
      </header>

      {/* BILLZ uslubi: markazda bitta karta — logotip, sarlavha, maydonlar, katta tugma */}
      <main className="lg-main">
        <div className="lg-card">
          <Link href="/" className="lg-brand lg-brand--anim" aria-label={t.brandHome}>
            <AnimatedLogo size={84} />
          </Link>

          <header className="lg-head">
            <h1 className="lg-title">{title}</h1>
            {subtitle && <p className="lg-sub">{subtitle}</p>}
          </header>

          <div className="lg-alerts">
            {blocked && <AuthAlert tone="warn">{t.blocked}</AuthAlert>}
            {welcome && (
              <AuthAlert tone="ok">
                {t.welcome}
                {defaultUsername && (
                  <> {t.yourLogin} <code>{defaultUsername}</code></>
                )}
              </AuthAlert>
            )}
            {dbError && <AuthAlert tone="error">{dbError}</AuthAlert>}
            {notice && !dbError && <AuthAlert tone="info">{notice}</AuthAlert>}
            {error && <AuthAlert tone="error">{error}</AuthAlert>}
          </div>

          {canLogin && (
            <form action={formAction} className="lg-form">
              {loginZone && <input type="hidden" name="loginZone" value={loginZone} />}
              {tenantSlug && <input type="hidden" name="tenantSlug" value={tenantSlug} />}
              <div className="lg-field">
                <label htmlFor="username">{d.auth.fields.username}</label>
                <div className="lg-control">
                  <input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder={d.auth.fields.usernamePlaceholder}
                    required
                    autoFocus
                    disabled={isPending}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              </div>
              <div className="lg-field">
                <div className="lg-label-row">
                  <label htmlFor="password">{d.auth.fields.password}</label>
                  {forgotUrl && <Link href={forgotUrl} className="lg-link">{t.forgot}</Link>}
                </div>
                <div className="lg-control lg-control--pwd">
                  <PasswordField id="password" name="password" autoComplete="current-password" placeholder={d.auth.fields.passwordPlaceholder} required disabled={isPending} />
                </div>
              </div>

              {loginZone === 'tenant' && (
                <label className="lg-check">
                  <input type="checkbox" name="remember" value="1" disabled={isPending} />
                  {t.remember}
                </label>
              )}

              <button type="submit" className="lg-submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <span className="au-spinner" aria-hidden="true" />
                    {t.submitting}
                  </>
                ) : (
                  d.common.login
                )}
              </button>
            </form>
          )}

          <p className="lg-note">
            {showRegister ? (
              <>{t.noStoreYet} <Link href="/register" className="lg-link">{t.registerLink}</Link></>
            ) : (
              <>{t.credentialsNote}</>
            )}
          </p>
        </div>

        <footer className="lg-foot">
          <nav aria-label={t.footNav}>
            <Link href="/help">{t.help}</Link>
            <Link href="/terms">{t.terms}</Link>
            <Link href="/privacy">{t.privacy}</Link>
          </nav>
          <span>© {new Date().getFullYear()} Savora. {t.rights}</span>
        </footer>
      </main>
    </div>
  );
}
