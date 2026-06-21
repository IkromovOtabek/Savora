'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { registerAction } from '@/app/actions/register';
import { normalizeSlug } from '@/lib/slug';
import { BUSINESS_TYPES } from '@/lib/businessTypes';
import { fmtPlanPrice, type PlanPreset } from '@/lib/plans';
import PasswordField from '@/components/auth/PasswordField';
import Icon from '@/components/icons/Icon';

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'savora.uz';
const APP_HOST = (process.env.NEXT_PUBLIC_APP_URL || 'https://savora.uz').replace(/^https?:\/\//, '').replace(/\/$/, '');
const PATH_ROUTING = process.env.NEXT_PUBLIC_USE_PATH_ROUTING !== 'false';

export default function RegisterForm({ plans }: { plans: PlanPreset[] }) {
  const [state, formAction, isPending] = useActionState(registerAction, null);
  const error = state?.error ?? null;

  const [step, setStep] = useState<1 | 2>(1);
  const [stepError, setStepError] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>('pro');
  const [visitorId, setVisitorId] = useState('');
  const [visitSessionId, setVisitSessionId] = useState('');

  useEffect(() => {
    setVisitorId(localStorage.getItem('sv_vid') || '');
    setVisitSessionId(sessionStorage.getItem('sv_sid') || '');
  }, []);

  // 1-qadam maydonlarini tekshirib, 2-qadamga o'tish
  function goToStep2(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.closest('form');
    if (!form) return;
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    const slug = String(fd.get('slug') || '').trim();
    const login = String(fd.get('adminUsername') || '').trim();
    const pw = String(fd.get('adminPassword') || '');
    const cpw = String(fd.get('confirmPassword') || '');
    if (!name) return setStepError('Do\'kon nomini kiriting.');
    if (!slug) return setStepError('Do\'kon manzilini kiriting.');
    if (login.length < 3) return setStepError('Login kamida 3 ta belgidan iborat bo\'lsin.');
    if (pw.length < 6) return setStepError('Parol kamida 6 ta belgi.');
    if (pw !== cpw) return setStepError('Parollar mos kelmadi.');
    setStepError(null);
    setStep(2);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card auth-card--wide">
        <Link href="/" className="auth-brand">
          <span className="brand-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 20 L12 6" stroke="var(--ink-1)" /><path d="M12 6 L18 20" stroke="var(--brand)" /></svg>
          </span>
          Savora
        </Link>

        {/* Qadam ko'rsatkichi */}
        <div className="reg-steps">
          <span className={`reg-step ${step === 1 ? 'reg-step--active' : 'reg-step--done'}`}>1. Ma&apos;lumot</span>
          <span className="reg-step-line" />
          <span className={`reg-step ${step === 2 ? 'reg-step--active' : ''}`}>2. Tarif</span>
        </div>

        <h1 className="auth-title">{step === 1 ? 'Do\'kon ma\'lumotlari' : 'Tarifni tanlang'}</h1>
        <p className="auth-subtitle">
          {step === 1
            ? 'Do\'koningizni 5 daqiqada sozlang. Karta talab qilinmaydi.'
            : 'Pulli tariflar 14 kun bepul sinov bilan boshlanadi.'}
        </p>

        {error && <div className="auth-alert auth-alert--error">{error}</div>}
        {stepError && step === 1 && <div className="auth-alert auth-alert--error">{stepError}</div>}

        <form action={formAction} className="auth-form">
          <input type="hidden" name="visitorId" value={visitorId} />
          <input type="hidden" name="visitSessionId" value={visitSessionId} />
          {/* ====== 1-QADAM: ma'lumot (2-qadamda yashiriladi, lekin DOM'da qoladi) ====== */}
          <div style={{ display: step === 1 ? 'block' : 'none' }}>
            <div className="auth-field">
              <label htmlFor="name">Do&apos;kon nomi *</label>
              <input id="name" name="name" type="text" disabled={isPending} placeholder="Masalan: Smart Phone" />
            </div>

            <div className="auth-field">
              <label htmlFor="slug">Do&apos;kon manzili *</label>
              <input
                id="slug"
                name="slug"
                type="text"
                disabled={isPending}
                placeholder="smartphone"
                onBlur={(e) => { e.target.value = normalizeSlug(e.target.value); }}
              />
              <span className="field-hint">{PATH_ROUTING ? `Sizning manzilingiz: ${APP_HOST}/t/smartphone` : `Sizning manzilingiz: smartphone.${ROOT}`}</span>
            </div>

            <div className="auth-field">
              <label htmlFor="adminUsername">Login (foydalanuvchi nomi) *</label>
              <input
                id="adminUsername"
                name="adminUsername"
                type="text"
                disabled={isPending}
                placeholder="masalan: smartadmin"
                autoComplete="username"
                onBlur={(e) => { e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''); }}
              />
              <span className="field-hint">Tizimga kirishda ishlatasiz. Faqat lotin harf, raqam, _ (kamida 3 belgi).</span>
            </div>

            <div className="auth-field">
              <label htmlFor="businessType">Biznes yo&apos;nalishi *</label>
              <select id="businessType" name="businessType" disabled={isPending} defaultValue="general">
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

            <div className="form-row">
              <div className="auth-field">
                <label htmlFor="adminPassword">Parol *</label>
                <PasswordField id="adminPassword" name="adminPassword" minLength={6} disabled={isPending} autoComplete="new-password" />
              </div>
              <div className="auth-field">
                <label htmlFor="confirmPassword">Parol tasdiq *</label>
                <input id="confirmPassword" name="confirmPassword" type="password" minLength={6} disabled={isPending} autoComplete="new-password" />
              </div>
            </div>

            <button type="button" className="btn btn-primary auth-submit btn-with-icon" onClick={goToStep2} disabled={isPending}>
              Keyingi: Tarif tanlash
              <Icon name="arrowRight" size={18} />
            </button>
          </div>

          {/* ====== 2-QADAM: tarif tanlash ====== */}
          <div style={{ display: step === 2 ? 'block' : 'none' }}>
            <div className="plan-pick-grid">
              {plans.map((p) => {
                const selected = plan === p.tier;
                return (
                  <label key={p.tier} className={`plan-pick${selected ? ' plan-pick--on' : ''}`}>
                    <input
                      type="radio"
                      name="planTier"
                      value={p.tier}
                      checked={selected}
                      onChange={() => setPlan(p.tier)}
                      className="plan-pick-radio"
                    />
                    <div className="plan-pick-head">
                      <span className="plan-pick-name">{p.label}</span>
                      {p.tier === 'pro' && <span className="plan-pick-badge">Ommabop</span>}
                    </div>
                    <div className="plan-pick-price">
                      {p.monthlyPrice === 0 ? 'Bepul' : <>{fmtPlanPrice(p.monthlyPrice)}<small>/oy</small></>}
                    </div>
                    <ul className="plan-pick-features">
                      {p.marketingFeatures.map((f, i) => (
                        <li key={i}><Icon name="check" size={13} /> {f}</li>
                      ))}
                    </ul>
                  </label>
                );
              })}
            </div>

            <p className="field-hint" style={{ marginTop: 12 }}>
              {plan === 'free'
                ? 'Bepul tarif — doimiy bepul, cheklovlar bilan. Modullar tarifga qarab avtomatik yoqiladi.'
                : '14 kun bepul sinov. Sinovdan keyin tarif to\'lovi orqali davom etadi. Modullar tarifga qarab avtomatik yoqiladi.'}
            </p>

            <div className="form-row" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-ghost btn-with-icon" onClick={() => setStep(1)} disabled={isPending}>
                <Icon name="arrowLeft" size={18} /> Orqaga
              </button>
              <button type="submit" className="btn btn-primary auth-submit btn-with-icon" disabled={isPending} style={{ flex: 1 }}>
                {isPending ? 'Yaratilmoqda...' : (<>Boshlash<Icon name="arrowRight" size={18} /></>)}
              </button>
            </div>
          </div>
        </form>

        <p className="auth-foot">
          Allaqachon hisobingiz bormi?{' '}
          <Link href="/login" style={{ color: 'var(--brand)', fontWeight: 700 }}>Kirish</Link>
        </p>
      </div>
    </div>
  );
}
