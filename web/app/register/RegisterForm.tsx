'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { registerAction } from '@/app/actions/register';
import { normalizeSlug } from '@/lib/slug';
import { BUSINESS_TYPES, type BusinessType } from '@/lib/businessTypes';
import { DEFAULT_PLAN_PRESETS, fmtPlanPrice, type PlanPreset } from '@/lib/plans';
import PasswordField from '@/components/auth/PasswordField';
import Icon from '@/components/icons/Icon';
import { AuthAlert } from '@/components/auth/AuthShell';
import { BrandGlyph } from '@/components/BrandMark';
import LangSwitch from '@/components/LangSwitch';
import { useDict } from '@/lib/i18n/client';
import '@/components/auth/auth.css';
import './register.css';

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'savora.uz';
const APP_HOST = (process.env.NEXT_PUBLIC_APP_URL || 'https://savora.uz').replace(/^https?:\/\//, '').replace(/\/$/, '');
const PATH_ROUTING = process.env.NEXT_PUBLIC_USE_PATH_ROUTING !== 'false';
const shopUrl = (slug: string) => (PATH_ROUTING ? `${APP_HOST}/t/${slug}` : `${slug}.${ROOT}`);

export default function RegisterForm({ plans }: { plans: PlanPreset[] }) {
  const [state, formAction, isPending] = useActionState(registerAction, null);
  const error = state?.error ?? null;
  const d = useDict();
  const t = d.auth.register;

  const [step, setStep] = useState<1 | 2>(1);
  const [stepError, setStepError] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>('pro');
  const [bizType, setBizType] = useState<BusinessType>('general');
  const [visitorId, setVisitorId] = useState('');
  const [visitSessionId, setVisitSessionId] = useState('');
  // Jonli ko'rinish uchun: nom, manzil (nomdan avtomatik, qo'lda o'zgartirilsa — o'shasi), egasi
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [owner, setOwner] = useState('');

  useEffect(() => {
    setVisitorId(localStorage.getItem('sv_vid') || '');
    setVisitSessionId(sessionStorage.getItem('sv_sid') || '');
  }, []);

  const selectedPlan = plans.find((p) => p.tier === plan);
  const biz = BUSINESS_TYPES[bizType];
  const bizText = d.catalog.businessTypes[bizType];

  // Tarif nomi va marketing ro'yxati — joriy tilda. Super admin ro'yxatni o'zgartirgan bo'lsa, o'sha (uz) ko'rsatiladi.
  const planLabel = (p: PlanPreset) => d.catalog.planTiers[p.tier] ?? p.label;
  function planFeatures(p: PlanPreset): string[] {
    const def = p.tier === 'custom' ? undefined : DEFAULT_PLAN_PRESETS[p.tier]?.marketingFeatures;
    const translated = p.tier === 'custom' ? undefined : t.planFeatures[p.tier];
    const isDefault = !!def && def.length === p.marketingFeatures.length && def.every((f, i) => f === p.marketingFeatures[i]);
    return isDefault && translated ? translated : p.marketingFeatures;
  }
  // Rozilik matni: {offer} / {privacy} o'rniga havolalar
  const consentNodes = t.consent.split(/(\{offer\}|\{privacy\})/).map((part, i) => {
    if (part === '{offer}') return <a key={i} href="/terms" target="_blank" rel="noopener">{t.consentOffer}</a>;
    if (part === '{privacy}') return <a key={i} href="/privacy" target="_blank" rel="noopener">{t.consentPrivacy}</a>;
    return part;
  });

  // 1-qadam maydonlarini tekshirib, 2-qadamga o'tish
  function goToStep2(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.closest('form');
    if (!form) return;
    const fd = new FormData(form);
    const login = String(fd.get('adminUsername') || '').trim();
    const pw = String(fd.get('adminPassword') || '');
    const cpw = String(fd.get('confirmPassword') || '');
    if (!name.trim()) return setStepError(t.errName);
    if (!slug.trim()) return setStepError(t.errSlug);
    if (login.length < 3) return setStepError(t.errLoginShort);
    if (pw.length < 6) return setStepError(d.auth.errors.passwordShort);
    if (pw !== cpw) return setStepError(d.auth.errors.passwordMismatch);
    setStepError(null);
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="rg">
      <header className="rg-bar">
        <Link href="/" className="rg-logo" aria-label={d.auth.login.brandHome}>
          <span className="rg-logo-mark"><BrandGlyph size={32} radius={0} /></span>
          Savora
        </Link>
        <div className="rg-bar-r"><span>{t.haveAccount}</span> <Link href="/login">{d.common.login}</Link> <LangSwitch compact /></div>
      </header>

      <div className="rg-main">
        <section className="rg-card" aria-labelledby="rg-title">
          <ol className="rg-steps" aria-label={t.stepsLabel}>
            <li className={step === 1 ? 'is-on' : 'is-done'} aria-current={step === 1 ? 'step' : undefined}>
              <span className="rg-step-n">{step === 1 ? '1' : <Icon name="check" size={14} strokeWidth={3} />}</span>
              {t.step1}
            </li>
            <li className={step === 2 ? 'is-on' : undefined} aria-current={step === 2 ? 'step' : undefined}>
              <span className="rg-step-n">2</span>
              {t.step2}
            </li>
          </ol>

          <header className="rg-head">
            <h1 id="rg-title">{step === 1 ? t.title1 : t.title2}</h1>
            <p>
              {step === 1 ? t.lead1 : t.lead2}
            </p>
          </header>

          {error && <AuthAlert tone="error">{error}</AuthAlert>}
          {stepError && step === 1 && <AuthAlert tone="error">{stepError}</AuthAlert>}

          <form action={formAction}>
            <input type="hidden" name="visitorId" value={visitorId} />
            <input type="hidden" name="visitSessionId" value={visitSessionId} />

            {/* ====== 1-QADAM (2-qadamda yashiriladi, lekin DOM'da qoladi — qiymatlar yuboriladi) ====== */}
            <div className="rg-step" style={{ display: step === 1 ? 'grid' : 'none' }}>
              <fieldset className="rg-set">
                <legend>{t.storeLegend}</legend>
                <div className="rg-grid2">
                  <div className="rg-field">
                    <label htmlFor="name">{t.storeName}</label>
                    <input
                      id="name" name="name" type="text" disabled={isPending} placeholder={t.storeNamePlaceholder}
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (!slugTouched) setSlug(normalizeSlug(e.target.value));
                      }}
                    />
                  </div>
                  <div className="rg-field">
                    <label htmlFor="slug">{t.storeSlug}</label>
                    <input
                      id="slug" name="slug" type="text" disabled={isPending} placeholder="smartphone"
                      autoCapitalize="none" autoCorrect="off" spellCheck={false}
                      value={slug}
                      onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
                      onBlur={(e) => setSlug(normalizeSlug(e.target.value))}
                    />
                  </div>
                </div>
                <p className="rg-hint">{t.address}: <b>{shopUrl(slug || 'smartphone')}</b></p>
              </fieldset>

              <fieldset className="rg-set">
                <legend id="biz-label">{t.bizLegend}</legend>
                <div className="rg-biz" role="radiogroup" aria-labelledby="biz-label">
                  {(Object.entries(BUSINESS_TYPES) as [BusinessType, (typeof BUSINESS_TYPES)[BusinessType]][]).map(([key, val]) => {
                    const on = bizType === key;
                    return (
                      <label key={key} className={`rg-biz-tile${on ? ' is-on' : ''}`}>
                        <input type="radio" name="businessType" value={key} checked={on} onChange={() => setBizType(key)} disabled={isPending} />
                        <span className="rg-biz-ic"><Icon name={val.icon} size={18} /></span>
                        <span className="rg-biz-t"><strong>{d.catalog.businessTypes[key].label}</strong><small>{d.catalog.businessTypes[key].description}</small></span>
                      </label>
                    );
                  })}
                </div>
                <p className="rg-hint">{t.bizHint}</p>
              </fieldset>

              <fieldset className="rg-set">
                <legend>{t.credsLegend}</legend>
                <div className="rg-field">
                  <label htmlFor="adminUsername">{d.auth.fields.username}</label>
                  <input
                    id="adminUsername" name="adminUsername" type="text" disabled={isPending} placeholder={t.usernamePlaceholder}
                    autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    onBlur={(e) => { e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''); }}
                  />
                  <span className="rg-hint">{t.usernameHint}</span>
                </div>
                <div className="rg-grid2">
                  <div className="rg-field">
                    <label htmlFor="adminPassword">{d.auth.fields.password}</label>
                    <div className="rg-pwd"><PasswordField id="adminPassword" name="adminPassword" minLength={6} disabled={isPending} autoComplete="new-password" placeholder={d.auth.fields.minChars} /></div>
                  </div>
                  <div className="rg-field">
                    <label htmlFor="confirmPassword">{d.auth.fields.confirmPassword}</label>
                    <div className="rg-pwd"><PasswordField id="confirmPassword" name="confirmPassword" minLength={6} disabled={isPending} autoComplete="new-password" placeholder={d.auth.fields.repeat} /></div>
                  </div>
                </div>
              </fieldset>

              <fieldset className="rg-set">
                <legend>{t.extraLegend} <span>({d.common.optional.toLowerCase()})</span></legend>
                <div className="rg-grid2">
                  <div className="rg-field">
                    <label htmlFor="ownerName">{t.ownerName}</label>
                    <input id="ownerName" name="ownerName" type="text" disabled={isPending} placeholder={t.ownerPlaceholder} value={owner} onChange={(e) => setOwner(e.target.value)} />
                  </div>
                  <div className="rg-field">
                    <label htmlFor="phone">{d.common.phone}</label>
                    <input id="phone" name="phone" type="tel" disabled={isPending} placeholder="+998..." />
                  </div>
                </div>
                <div className="rg-field">
                  <label htmlFor="referredBy">{t.referral}</label>
                  <input id="referredBy" name="referredBy" type="text" disabled={isPending} placeholder={t.referralPlaceholder} maxLength={10} style={{ textTransform: 'uppercase' }} />
                  <span className="rg-hint">{t.referralHint}</span>
                </div>
              </fieldset>

              <button type="button" className="rg-btn rg-btn--primary" onClick={goToStep2} disabled={isPending}>
                {t.continueToPlan}
              </button>
            </div>

            {/* ====== 2-QADAM: tarif ====== */}
            <div className="rg-step" style={{ display: step === 2 ? 'grid' : 'none' }}>
              <div className="rg-plans" role="radiogroup" aria-label={t.planGroup}>
                {plans.map((p) => {
                  const selected = plan === p.tier;
                  return (
                    <label key={p.tier} className={`rg-plan${selected ? ' is-on' : ''}`}>
                      <input type="radio" name="planTier" value={p.tier} checked={selected} onChange={() => setPlan(p.tier)} />
                      <span className="rg-plan-head">
                        <span className="rg-plan-name">{planLabel(p)}</span>
                        {p.tier === 'pro' && <span className="rg-plan-badge">{t.popular}</span>}
                      </span>
                      <span className="rg-plan-price">
                        {p.monthlyPrice === 0 ? t.free : <>{fmtPlanPrice(p.monthlyPrice).replace(/ so'm$/, ` ${d.common.sum}`)}<small> {t.perMonth}</small></>}
                      </span>
                      <ul>
                        {planFeatures(p).map((f, i) => (
                          <li key={i}><Icon name="check" size={13} strokeWidth={2.6} /> {f}</li>
                        ))}
                      </ul>
                    </label>
                  );
                })}
              </div>

              <label className="au-consent" htmlFor="acceptTerms">
                <input id="acceptTerms" name="acceptTerms" type="checkbox" value="1" required disabled={isPending} />
                <span>{consentNodes}</span>
              </label>

              <div className="rg-actions">
                <button type="button" className="rg-btn rg-btn--ghost" onClick={() => setStep(1)} disabled={isPending}>
                  <Icon name="arrowLeft" size={17} /> {d.common.back}
                </button>
                <button type="submit" className="rg-btn rg-btn--primary" disabled={isPending}>
                  {isPending ? t.creating : t.createStore}
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* Jonli ko'rinish — kiritilgan ma'lumotlar bo'yicha bo'lajak do'kon */}
        <aside className="rg-preview" aria-label={t.previewLabel}>
          <div className="rg-shop">
            <div className="rg-shop-top">
              <span className="rg-shop-ic"><Icon name={biz.icon} size={22} /></span>
              <span className="rg-shop-t">
                <b>{name.trim() || t.previewName}</b>
                <small>{bizText.label}</small>
              </span>
            </div>
            <dl className="rg-shop-kv">
              <div><dt>{t.address}</dt><dd>{shopUrl(slug || 'smartphone')}</dd></div>
              <div><dt>{t.owner}</dt><dd>{owner.trim() || '—'}</dd></div>
              <div>
                <dt>{t.planGroup}</dt>
                <dd>
                  {selectedPlan ? planLabel(selectedPlan) : '—'}
                  {selectedPlan && <small> · {selectedPlan.monthlyPrice === 0 ? t.foreverFree : t.trial14}</small>}
                </dd>
              </div>
            </dl>
          </div>
          <ul className="rg-perks">
            <li><Icon name="check" size={15} strokeWidth={2.6} /> {t.perk1}</li>
            <li><Icon name="check" size={15} strokeWidth={2.6} /> {t.perk2}</li>
            <li><Icon name="check" size={15} strokeWidth={2.6} /> {t.perk3}</li>
          </ul>
          <div className="rg-help">
            <b>{t.helpTitle}</b>
            <span>{t.helpText}</span>
            <Link href="/contact">{t.helpLink} <Icon name="arrowRight" size={14} /></Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
