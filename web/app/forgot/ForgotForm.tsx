'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { confirmPasswordResetAction, requestPasswordResetAction } from '@/app/actions/auth';
import AuthShell, { AuthAlert } from '@/components/auth/AuthShell';
import PasswordField from '@/components/auth/PasswordField';
import Icon from '@/components/icons/Icon';

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

  return (
    <AuthShell
      title={title}
      subtitle={storeName || undefined}
      top={
        canReset ? (
          <div className="au-steps" role="list" aria-label="Parolni tiklash qadamlari">
            <span role="listitem" aria-current={!codeStep ? 'step' : undefined}>1. Login</span>
            <span role="listitem" aria-current={codeStep ? 'step' : undefined}>2. Kod</span>
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
          <p className="au-help">Telegram&apos;ga kelgan 6 xonali kodni va yangi parolni kiriting.</p>
          <div className="au-group">
            <div className="au-row">
              <label htmlFor="code">Tasdiqlash kodi</label>
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
              <label htmlFor="newPassword">Yangi parol</label>
              <PasswordField id="newPassword" name="newPassword" autoComplete="new-password" minLength={6} placeholder="Kamida 6 belgi" required disabled={isConfirming} />
            </div>
            <div className="au-row">
              <label htmlFor="confirmPassword">Yangi parolni takrorlang</label>
              <PasswordField id="confirmPassword" name="confirmPassword" autoComplete="new-password" minLength={6} placeholder="Takrorlang" required disabled={isConfirming} />
            </div>
          </div>
          <button type="submit" className="au-btn au-btn--filled au-btn--block" disabled={isConfirming}>
            {isConfirming ? 'Saqlanmoqda…' : 'Parolni yangilash'}
          </button>
        </form>
      )}

      {canReset && !state?.step && (
        <form action={formAction} className="au-form">
          {tenantSlug && <input type="hidden" name="tenantSlug" value={tenantSlug} />}
          <p className="au-help">
            Loginni kiriting. Bir martalik tasdiqlash kodi do&apos;konning ulangan Telegram&apos;iga yuboriladi.
            Telegram ulanmagan bo&apos;lsa, do&apos;kon admini yoki platforma egasiga murojaat qiling.
          </p>
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
              />
            </div>
          </div>
          <button type="submit" className="au-btn au-btn--filled au-btn--block" disabled={isPending}>
            {isPending ? 'Yuborilmoqda…' : 'Kod yuborish'}
          </button>
        </form>
      )}

      <div className="au-links">
        <Link href={loginUrl} className="au-btn au-btn--plain">
          <Icon name="arrowLeft" size={17} /> Kirish sahifasiga qaytish
        </Link>
      </div>
    </AuthShell>
  );
}
