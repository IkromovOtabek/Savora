'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { registerAction } from '@/app/actions/register';
import { normalizeSlug } from '@/lib/slug';
import { BUSINESS_TYPES } from '@/lib/businessTypes';
import PasswordField from '@/components/auth/PasswordField';
import Icon from '@/components/icons/Icon';

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'lvh.me';

export default function RegisterForm() {
  const [state, formAction, isPending] = useActionState(registerAction, null);
  const error = state?.error ?? null;

  return (
    <div className="auth-wrap">
      <div className="auth-card auth-card--wide">
        <Link href="/" className="auth-brand">
          <span className="brand-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 20 L12 6" stroke="var(--ink-1)" /><path d="M12 6 L18 20" stroke="var(--brand)" /></svg>
          </span>
          Savora
        </Link>

        <h1 className="auth-title">Ro&apos;yxatdan o&apos;tish — 7 kun bepul</h1>
        <p className="auth-subtitle">Do&apos;koningizni 5 daqiqada sozlang. Karta talab qilinmaydi.</p>

        {error && <div className="auth-alert auth-alert--error">{error}</div>}

        <form action={formAction} className="auth-form">
          <div className="auth-field">
            <label htmlFor="name">Do&apos;kon nomi *</label>
            <input id="name" name="name" type="text" required disabled={isPending} placeholder="Masalan: Smart Phone" />
          </div>

          <div className="auth-field">
            <label htmlFor="slug">Do&apos;kon manzili *</label>
            <input
              id="slug"
              name="slug"
              type="text"
              required
              disabled={isPending}
              placeholder="smartphone"
              onBlur={(e) => { e.target.value = normalizeSlug(e.target.value); }}
            />
            <span className="field-hint">{`Sizning manzilingiz: smartphone.${ROOT}`}</span>
          </div>

          <div className="auth-field">
            <label htmlFor="businessType">Biznes yo&apos;nalishi *</label>
            <select id="businessType" name="businessType" required disabled={isPending} defaultValue="general">
              {Object.entries(BUSINESS_TYPES).map(([key, val]) => (
                <option key={key} value={key}>{val.label} — {val.description}</option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="auth-field">
              <label htmlFor="ownerName">Egasi ismi</label>
              <input id="ownerName" name="ownerName" type="text" disabled={isPending} />
            </div>
            <div className="auth-field">
              <label htmlFor="phone">Telefon</label>
              <input id="phone" name="phone" type="tel" disabled={isPending} placeholder="+998..." />
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="referredBy">Tavsiya kodi <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>(ixtiyoriy)</span></label>
            <input id="referredBy" name="referredBy" type="text" disabled={isPending} placeholder="Masalan: SHOP1A2B" maxLength={10} style={{ textTransform: 'uppercase' }} />
            <span className="field-hint">Do&apos;st tavsiya kodi bo&apos;lsa, ikkalingiz 1 oy bonus olasiz</span>
          </div>

          <p className="field-hint">Ro&apos;yxatdan keyin siz do&apos;kon admini sifatida avtomatik kirasiz.</p>

          <div className="form-row">
            <div className="auth-field">
              <label htmlFor="adminPassword">Parol *</label>
              <PasswordField id="adminPassword" name="adminPassword" required minLength={6} disabled={isPending} autoComplete="new-password" />
            </div>
            <div className="auth-field">
              <label htmlFor="confirmPassword">Parol tasdiq *</label>
              <input id="confirmPassword" name="confirmPassword" type="password" required minLength={6} disabled={isPending} autoComplete="new-password" />
            </div>
          </div>

          <button type="submit" className="btn btn-primary auth-submit btn-with-icon" disabled={isPending}>
            {isPending ? 'Yaratilmoqda...' : (
              <>
                Bepul boshlash
                <Icon name="arrowRight" size={18} />
              </>
            )}
          </button>
        </form>

        <p className="auth-foot">
          Allaqachon hisobingiz bormi?{' '}
          <Link href="/#kirish" style={{ color: 'var(--brand)', fontWeight: 700 }}>Kirish</Link>
        </p>
      </div>
    </div>
  );
}
