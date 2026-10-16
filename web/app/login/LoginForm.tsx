'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { loginAction } from '@/app/actions/auth';
import PasswordField from '@/components/auth/PasswordField';
import { AuthAlert } from '@/components/auth/AuthShell';
import { BrandGlyph } from '@/components/BrandMark';
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
  const d = useDict();
  const t = d.auth.login;

  return (
    <div className="lg">
      <aside className="lg-panel">
        <Link href="/" className="lg-back">
          <Icon name="arrowLeft" size={16} />
          {d.common.home}
        </Link>

        <div className="lg-pitch">
          <Link href="/" className="lg-brand" aria-label={t.brandHome}>
            <span className="lg-brand-mark"><BrandGlyph size={36} radius={0} /></span>
            Savora
          </Link>
          <h2>{t.pitchTitle}</h2>
          <p>{t.pitchText}</p>
        </div>

        <ul className="lg-trust">
          <li>{t.trustCloud}</li>
          <li>{t.trustSecure}</li>
          <li>{t.trustAlways}</li>
        </ul>
      </aside>

      <main className="lg-side">
        <div className="lg-card">
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
                  <Icon name="user" size={18} className="lg-control-ic" />
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
                    defaultValue={defaultUsername}
                  />
                </div>
              </div>
              <div className="lg-field">
                <label htmlFor="password">{d.auth.fields.password}</label>
                <div className="lg-control lg-control--pwd">
                  <Icon name="lock" size={18} className="lg-control-ic" />
                  <PasswordField id="password" name="password" autoComplete="current-password" placeholder={d.auth.fields.passwordPlaceholder} required disabled={isPending} />
                </div>
              </div>

              {(loginZone === 'tenant' || forgotUrl) && (
                <div className="lg-row">
                  {loginZone === 'tenant' ? (
                    <label className="lg-check">
                      <input type="checkbox" name="remember" value="1" disabled={isPending} />
                      {t.remember}
                    </label>
                  ) : <span />}
                  {forgotUrl && <Link href={forgotUrl} className="lg-link">{t.forgot}</Link>}
                </div>
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
          <span>© {new Date().getFullYear()} Savora. {t.rights}</span>
          <nav aria-label={t.footNav}>
            <Link href="/help">{t.help}</Link>
            <Link href="/terms">{t.terms}</Link>
            <Link href="/privacy">{t.privacy}</Link>
            <LangSwitch compact />
          </nav>
        </footer>
      </main>
    </div>
  );
}
