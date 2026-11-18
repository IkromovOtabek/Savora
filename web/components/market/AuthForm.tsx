'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { buyerLoginAction, buyerRegisterAction } from '@/app/actions/market';
import { formatUzPhoneInput, PHONE_PLACEHOLDER } from '@/lib/phone';
import { useDict } from '@/lib/i18n/client';

/** Xaridor kirishi / ro'yxatdan o'tishi (telefon + parol) */
export default function AuthForm({ mode, next }: { mode: 'login' | 'register'; next: string }) {
  const t = useDict().ecom.market.auth;
  const [state, action, pending] = useActionState(mode === 'login' ? buyerLoginAction : buyerRegisterAction, null);
  const [phone, setPhone] = useState('+998 ');
  const q = next !== '/market' ? `?next=${encodeURIComponent(next)}` : '';

  return (
    <form action={action} className="mk-auth">
      <div>
        <h1>{mode === 'login' ? t.loginTitle : t.registerTitle}</h1>
        <p className="mk-muted">{t.sub}</p>
      </div>
      <input type="hidden" name="next" value={next} />
      {mode === 'register' && (
        <div className="mk-field">
          <label htmlFor="mk-name">{t.name}</label>
          <input id="mk-name" name="name" required minLength={2} maxLength={80} autoComplete="name" />
        </div>
      )}
      <div className="mk-field">
        <label htmlFor="mk-phone">{t.phone}</label>
        <input
          id="mk-phone" name="phone" type="tel" inputMode="tel" required autoComplete="tel"
          placeholder={PHONE_PLACEHOLDER} value={phone} onChange={(e) => setPhone(formatUzPhoneInput(e.target.value))}
        />
      </div>
      <div className="mk-field">
        <label htmlFor="mk-pass">{t.password}</label>
        <input id="mk-pass" name="password" type="password" required minLength={mode === 'register' ? 6 : 1} maxLength={100} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        {mode === 'register' && <small>{t.passwordHint}</small>}
      </div>
      {state?.error && <p className="mk-alert" role="alert">{state.error}</p>}
      <button type="submit" className="mk-btn mk-btn--lg mk-btn--block" disabled={pending}>{mode === 'login' ? t.login : t.register}</button>
      <div className="mk-auth-links">
        {mode === 'login'
          ? <Link href={`/market/register${q}`}>{t.noAccount}</Link>
          : <Link href={`/market/login${q}`}>{t.haveAccount}</Link>}
        <Link href="/login" className="mk-muted" style={{ fontWeight: 500 }}>{t.businessHint}</Link>
      </div>
    </form>
  );
}
