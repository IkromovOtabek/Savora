'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { registerAction } from '@/app/actions/register';
import { normalizeSlug } from '@/lib/slug';
import { BUSINESS_TYPES, type BusinessType } from '@/lib/businessTypes';
import { fmtPlanPrice, type PlanPreset } from '@/lib/plans';
import PasswordField from '@/components/auth/PasswordField';
import Icon from '@/components/icons/Icon';
import AuthShell, { AuthAlert } from '@/components/auth/AuthShell';

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'savora.uz';
const APP_HOST = (process.env.NEXT_PUBLIC_APP_URL || 'https://savora.uz').replace(/^https?:\/\//, '').replace(/\/$/, '');
const PATH_ROUTING = process.env.NEXT_PUBLIC_USE_PATH_ROUTING !== 'false';

export default function RegisterForm({ plans }: { plans: PlanPreset[] }) {
  const [state, formAction, isPending] = useActionState(registerAction, null);
  const error = state?.error ?? null;

  const [step, setStep] = useState<1 | 2>(1);
  const [stepError, setStepError] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>('pro');
  const [bizType, setBizType] = useState<BusinessType>('general');
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
    <AuthShell
      wide
      top={
        <div className="au-steps" role="list" aria-label="Ro'yxatdan o'tish qadamlari">
          <span role="listitem" aria-current={step === 1 ? 'step' : undefined}>1. Ma&apos;lumot</span>
          <span role="listitem" aria-current={step === 2 ? 'step' : undefined}>2. Tarif</span>
        </div>
      }
      title={step === 1 ? "Do'kon ma'lumotlari" : 'Tarifni tanlang'}
      subtitle={
        step === 1
          ? "Do'koningizni 5 daqiqada sozlang. Karta talab qilinmaydi."
          : 'Pulli tariflar 14 kun bepul sinov bilan boshlanadi.'
      }
    >
      {error && <AuthAlert tone="error">{error}</AuthAlert>}
      {stepError && step === 1 && <AuthAlert tone="error">{stepError}</AuthAlert>}

      <form action={formAction} className="au-form">
        <input type="hidden" name="visitorId" value={visitorId} />
        <input type="hidden" name="visitSessionId" value={visitSessionId} />

        {/* ====== 1-QADAM: ma'lumot (2-qadamda yashiriladi, lekin DOM'da qoladi) ====== */}
        <div className="au-form" style={{ display: step === 1 ? 'grid' : 'none' }}>
          <div className="au-section">
            <div className="au-ghead">Do&apos;kon</div>
            <div className="au-group">
              <div className="au-row">
                <label htmlFor="name">Do&apos;kon nomi *</label>
                <input id="name" name="name" type="text" disabled={isPending} placeholder="Masalan: Smart Phone" />
              </div>
              <div className="au-row">
                <label htmlFor="slug">Do&apos;kon manzili *</label>
                <input
                  id="slug"
                  name="slug"
                  type="text"
                  disabled={isPending}
                  placeholder="smartphone"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onBlur={(e) => { e.target.value = normalizeSlug(e.target.value); }}
                />
                <span className="au-hint">
                  Sizning manzilingiz: <b>{PATH_ROUTING ? `${APP_HOST}/t/smartphone` : `smartphone.${ROOT}`}</b>
                </span>
              </div>
            </div>
          </div>

          <div className="au-section">
            <div className="au-ghead" id="biz-label">Biznes yo&apos;nalishi *</div>
            <div className="au-biz-grid" role="radiogroup" aria-labelledby="biz-label">
              {(Object.entries(BUSINESS_TYPES) as [BusinessType, (typeof BUSINESS_TYPES)[BusinessType]][]).map(([key, val]) => {
                const on = bizType === key;
                return (
                  <label key={key} className={`au-biz${on ? ' au-biz--on' : ''}`}>
                    <input
                      type="radio"
                      name="businessType"
                      value={key}
                      checked={on}
                      onChange={() => setBizType(key)}
                      disabled={isPending}
                    />
                    <span className="au-biz-sq"><Icon name={val.icon} size={17} strokeWidth={2.2} /></span>
                    <strong>{val.label}</strong>
                    <small>{val.description}</small>
                  </label>
                );
              })}
            </div>
            <div className="au-gfoot">Menyu va modullar tanlangan yo&apos;nalishga moslab sozlanadi (keyin o&apos;zgartirish mumkin).</div>
          </div>

          <div className="au-section">
            <div className="au-ghead">Kirish ma&apos;lumotlari</div>
            <div className="au-group">
              <div className="au-row">
                <label htmlFor="adminUsername">Login (foydalanuvchi nomi) *</label>
                <input
                  id="adminUsername"
                  name="adminUsername"
                  type="text"
                  disabled={isPending}
                  placeholder="masalan: smartadmin"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onBlur={(e) => { e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''); }}
                />
                <span className="au-hint">Tizimga kirishda ishlatasiz. Faqat lotin harf, raqam va _ (kamida 3 belgi).</span>
              </div>
              <div className="au-row au-row--split">
                <div>
                  <label htmlFor="adminPassword">Parol *</label>
                  <PasswordField id="adminPassword" name="adminPassword" minLength={6} disabled={isPending} autoComplete="new-password" placeholder="Kamida 6 belgi" />
                </div>
                <div>
                  <label htmlFor="confirmPassword">Parol tasdig&apos;i *</label>
                  <PasswordField id="confirmPassword" name="confirmPassword" minLength={6} disabled={isPending} autoComplete="new-password" placeholder="Takrorlang" />
                </div>
              </div>
            </div>
          </div>

          <div className="au-section">
            <div className="au-ghead">Qo&apos;shimcha</div>
            <div className="au-group">
              <div className="au-row au-row--split">
                <div>
                  <label htmlFor="ownerName">Egasi ismi</label>
                  <input id="ownerName" name="ownerName" type="text" disabled={isPending} placeholder="Ism Familiya" />
                </div>
                <div>
                  <label htmlFor="phone">Telefon</label>
                  <input id="phone" name="phone" type="tel" disabled={isPending} placeholder="+998..." />
                </div>
              </div>
              <div className="au-row">
                <label htmlFor="referredBy">Tavsiya kodi (ixtiyoriy)</label>
                <input id="referredBy" name="referredBy" type="text" disabled={isPending} placeholder="Masalan: SHOP1A2B" maxLength={10} style={{ textTransform: 'uppercase' }} />
              </div>
            </div>
            <div className="au-gfoot">Do&apos;st tavsiya kodi bo&apos;lsa, ikkalingiz 1 oy bonus olasiz.</div>
          </div>

          <button type="button" className="au-btn au-btn--filled au-btn--block" onClick={goToStep2} disabled={isPending}>
            Keyingi: tarif tanlash
            <Icon name="arrowRight" size={18} />
          </button>
        </div>

        {/* ====== 2-QADAM: tarif tanlash ====== */}
        <div className="au-form" style={{ display: step === 2 ? 'grid' : 'none' }}>
          <div className="au-plan-grid" role="radiogroup" aria-label="Tarif">
            {plans.map((p) => {
              const selected = plan === p.tier;
              return (
                <label key={p.tier} className={`au-plan${selected ? ' au-plan--on' : ''}`}>
                  <input
                    type="radio"
                    name="planTier"
                    value={p.tier}
                    checked={selected}
                    onChange={() => setPlan(p.tier)}
                  />
                  <div className="au-plan-head">
                    <span className="au-plan-name">{p.label}</span>
                    {p.tier === 'pro' && <span className="au-plan-badge">Ommabop</span>}
                  </div>
                  <div className="au-plan-price">
                    {p.monthlyPrice === 0 ? 'Bepul' : <>{fmtPlanPrice(p.monthlyPrice)}<small> so&apos;m/oy</small></>}
                  </div>
                  <ul>
                    {p.marketingFeatures.map((f, i) => (
                      <li key={i}><Icon name="check" size={13} strokeWidth={2.6} /> {f}</li>
                    ))}
                  </ul>
                </label>
              );
            })}
          </div>

          <p className="au-gfoot" style={{ padding: 0 }}>
            {plan === 'free'
              ? `Bepul tarif — doimiy bepul, cheklovlar bilan. Modullar tarif va «${BUSINESS_TYPES[bizType].label}» yo'nalishiga qarab avtomatik yoqiladi.`
              : `14 kun bepul sinov. Sinovdan keyin tarif to'lovi orqali davom etadi. Modullar tarif va «${BUSINESS_TYPES[bizType].label}» yo'nalishiga qarab avtomatik yoqiladi.`}
          </p>

          <div className="au-actions">
            <button type="button" className="au-btn au-btn--gray" onClick={() => setStep(1)} disabled={isPending}>
              <Icon name="arrowLeft" size={18} /> Orqaga
            </button>
            <button type="submit" className="au-btn au-btn--filled au-btn--grow" disabled={isPending}>
              {isPending ? 'Yaratilmoqda…' : (<>Boshlash<Icon name="arrowRight" size={18} /></>)}
            </button>
          </div>
        </div>
      </form>

      <p className="au-foot">
        Allaqachon hisobingiz bormi?{' '}
        <Link href="/login" className="au-link">Kirish</Link>
      </p>
    </AuthShell>
  );
}
