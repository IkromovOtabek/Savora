'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { confirmPasswordResetAction, requestPasswordResetAction } from '@/app/actions/auth';
import AuthShell, { AuthAlert } from '@/components/auth/AuthShell';
import PasswordField from '@/components/auth/PasswordField';
import Icon from '@/components/icons/Icon';
import LangSwitch from '@/components/LangSwitch';
import { useDict } from '@/lib/i18n/client';

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
  const codeStep = state?.step === 'code';
  const d = useDict();
  const t = d.auth.forgot;

  return (
    <AuthShell
      title={title}
      subtitle={storeName || undefined}
      top={
        canReset ? (
          <div className="au-steps" role="list" aria-label={t.stepsLabel}>
            <span role="listitem" aria-current={!codeStep ? 'step' : undefined}>{t.step1}</span>
            <span role="listitem" aria-current={codeStep ? 'step' : undefined}>{t.step2}</span>
          </div>
        ) : undefined
      }
    >
      {notice && <AuthAlert tone="info">{notice}</AuthAlert>}
      {state?.error && <AuthAlert tone="error">{state.error}</AuthAlert>}
      {state?.success && !confirmState && <AuthAlert tone="info">{state.success}</AuthAlert>}
      {confirmState?.error && <AuthAlert tone="error">{confirmState.error}</AuthAlert>}
      {confirmState?.success && <AuthAlert tone="ok">{confirmState.success}</AuthAlert>}

      {canReset && codeStep && confirmState?.step !== 'done' && (
        <form action={confirmAction} className="au-form">
          {tenantSlug && <input type="hidden" name="tenantSlug" value={tenantSlug} />}
          <input type="hidden" name="username" value={state.username ?? ''} />
          <p className="au-help">{t.codeHelp}</p>
          <div className="au-group">
            <div className="au-row">
              <label htmlFor="code">{t.codeLabel}</label>
              <input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                placeholder="••••••"
                required
                autoFocus
                disabled={isConfirming}
                style={{ letterSpacing: '.3em', fontVariantNumeric: 'tabular-nums' }}
              />
            </div>
          </div>
          <div className="au-group">
            <div className="au-row">
              <label htmlFor="newPassword">{d.auth.fields.newPassword}</label>
              <PasswordField id="newPassword" name="newPassword" autoComplete="new-password" minLength={6} placeholder={d.auth.fields.minChars} required disabled={isConfirming} />
            </div>
            <div className="au-row">
              <label htmlFor="confirmPassword">{d.auth.fields.repeatNewPassword}</label>
              <PasswordField id="confirmPassword" name="confirmPassword" autoComplete="new-password" minLength={6} placeholder={d.auth.fields.repeat} required disabled={isConfirming} />
            </div>
          </div>
          <button type="submit" className="au-btn au-btn--filled au-btn--block" disabled={isConfirming}>
            {isConfirming ? d.common.saving : t.updatePassword}
          </button>
        </form>
      )}

      {canReset && !state?.step && (
        <form action={formAction} className="au-form">
          {tenantSlug && <input type="hidden" name="tenantSlug" value={tenantSlug} />}
          <p className="au-help">{t.requestHelp}</p>
          <div className="au-group">
            <div className="au-row">
              <label htmlFor="username">{d.auth.fields.username}</label>
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
              />
            </div>
          </div>
          <button type="submit" className="au-btn au-btn--filled au-btn--block" disabled={isPending}>
            {isPending ? d.common.sending : t.sendCode}
          </button>
        </form>
      )}

      <div className="au-links">
        <Link href={loginUrl} className="au-btn au-btn--plain">
          <Icon name="arrowLeft" size={17} /> {t.backToLogin}
        </Link>
        <LangSwitch compact />
      </div>
    </AuthShell>
  );
}
