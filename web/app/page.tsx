import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Onest } from 'next/font/google';
import { getAppZone } from '@/lib/tenantContext';
import { getCurrentUser } from '@/lib/auth';
import { superDashboardUrl } from '@/lib/urls';
import { getEffectivePlanPresets } from '@/lib/platformSettings';
import { getLatestReviews } from '@/lib/reviews';
import { LOCALHOST_LINKS } from '@/lib/urls';
import { BUSINESS_TYPES, BUSINESS_TYPE_IDS, TERMS } from '@/lib/businessTypes';
import { presetFor } from '@/lib/businessPresets';
import { PQ294_MAX_MONTHS, PQ294_MAX_BHM, PQ294_MAX_AMOUNT, PQ294_MAX_EXTRA_PCT_YEAR } from '@/lib/pq294';
import { getI18n } from '@/lib/i18n/server';
import { tr, fmtDayMonth } from '@/lib/i18n/fmt';
import Icon from '@/components/icons/Icon';
import ProductShowcase from '@/components/landing/ProductShowcase';
import Faq from '@/components/landing/Faq';
import { RotatingWord, HeroStage, CountUp } from '@/components/landing/HeroMotion';
import ThemeToggle from '@/components/ThemeToggle';
import LangSwitch from '@/components/LangSwitch';
import BrandMark from '@/components/BrandMark';
import SavoraJsonLd from '@/components/seo/JsonLd';
import '@/components/landing/landing.css';

const onest = Onest({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '600', '700', '800'], variable: '--font-onest', display: 'swap' });

/** Sinov muddati — register action bilan bir xil manba */
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 14);

function Svg({ children, size = 22 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
  );
}
const P = {
  cart: <><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.4 11.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L21 7H6" /></>,
  cal: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>,
  sign: <path d="M3 17c3-4 5-8 7-8s-1 8 2 8 3-5 5-5 2 3 4 3M3 21h18" />,
  bell: <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />,
  box: <><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  branch: <><circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="M6 9v6a3 3 0 0 0 3 3h6" /></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></>,
  scan: <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M17 8v8" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  check: <path d="M20 6 9 17l-5-5" />,
  phone: <><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></>,
  android: <><path d="M5 16V11a7 7 0 0 1 14 0v5H5zM8 5 6.5 2.5M16 5l1.5-2.5" /><circle cx="9.5" cy="10.5" r=".6" /><circle cx="14.5" cy="10.5" r=".6" /><path d="M8 16v4M16 16v4" /></>,
  apple: <><path d="M16.5 13.2c0-2.3 1.9-3.4 2-3.5a4.3 4.3 0 0 0-3.4-1.8c-1.4-.2-2.8.8-3.5.8s-1.8-.8-3-.8A4.5 4.5 0 0 0 4.8 10.3c-1.6 2.8-.4 6.9 1.1 9.1.8 1.1 1.7 2.3 2.9 2.3s1.6-.7 3-.7 1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.4-.9-2.4-3.7zM14.3 6.1A4 4 0 0 0 15.2 3a4.2 4.2 0 0 0-2.7 1.4 3.9 3.9 0 0 0-1 2.9 3.4 3.4 0 0 0 2.8-1.2z" /></>,
};

/** Mobil ilova havolalari (server env). Bo'sh bo'lsa tugma «Tez kunda» bo'ladi — halol holat. */
const MOBILE_ANDROID_URL = process.env.MOBILE_ANDROID_URL || '';
const MOBILE_IOS_URL = process.env.MOBILE_IOS_URL || '';

/** Nasiya oqimi qadamlari ikonkalari — matnlar lug'atda (d.landing.flow.steps) */
const FLOW_ICONS = [P.cart, P.cal, P.sign, P.bell];

const PLANS_STATIC = [
  { tier: 'starter' as const, featured: false },
  { tier: 'pro' as const, featured: true },
  { tier: 'business' as const, featured: false },
];

/** 2027 (PQ-294) — Savora qanday yordam beradi. Holat halol: faqat bor narsa "Bor". Matnlar: d.landing.pq.help */
const PQ_HELP_STATUS: ('ready' | 'soon')[] = ['ready', 'ready', 'ready', 'soon', 'soon', 'soon'];

/** AI yordamchi rollari ikonkalari — matnlar lug'atda (d.landing.ai.roles) */
const AI_ICONS = [P.chart, P.users, P.check];

/** BNPL komissiyasi bilan taqqoslash misoli (taxminiy, ochiq manbalar) */
const EX_PRICE = 10_000_000;
const EX_BNPL_FEE = 0.3;

/** Deterministik (server=client) — raqam guruhlari NBSP bilan */
const fmtNum = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, String.fromCharCode(0xA0));

function initialsOf(s: string): string {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '★';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default async function LandingPage() {
  const zone = await getAppZone();
  if (zone !== 'root') {
    const user = await getCurrentUser();
    if (zone === 'super') redirect(user ? superDashboardUrl('/super') : '/super/login');
    redirect(user ? '/app' : '/login');
  }

  const { locale, d } = await getI18n();
  const L = d.landing;
  /** Tarif narxi — tilga mos «so'm/сум» va «Bepul/Бесплатно» */
  const money = (n: number) => (n === 0 ? L.plans.free : `${fmtNum(n)} ${d.common.sum}`);

  const reviews = await getLatestReviews(6);
  const presets = await getEffectivePlanPresets();
  const plans = PLANS_STATIC.map(({ tier, featured }) => {
    const p = presets[tier];
    return { name: p.label, desc: p.description, price: money(p.monthlyPrice), isFree: p.monthlyPrice === 0, featured, feats: p.marketingFeatures };
  });
  const sectors = BUSINESS_TYPE_IDS.map((id) => d.catalog.businessTypes[id].label);
  const sectorCards = BUSINESS_TYPE_IDS.map((id) => {
    const pre = presetFor(id);
    const tags = [
      TERMS[id].hasImei && L.sectors.tags.imei,
      pre.nasiya && L.sectors.tags.nasiya,
      pre.creditKassa && L.sectors.tags.credit,
      pre.daftar && L.sectors.tags.daftar,
      pre.mediaUpload && L.sectors.tags.media,
      pre.inventory && L.sectors.tags.inventory,
    ].filter(Boolean) as string[];
    return { id, icon: BUSINESS_TYPES[id].icon, ...d.catalog.businessTypes[id], tags: tags.slice(0, 3) };
  });
  const planLimits = PLANS_STATIC.map(({ tier }) => {
    const p = presets[tier];
    return { label: p.label, maxFilial: p.maxFilial, maxUsers: p.maxUsers };
  });
  const proPrice = presets.pro.monthlyPrice;
  const bnplFee = Math.round(EX_PRICE * EX_BNPL_FEE);
  /** Nasiya jadvali namunasi (bento) — sanalar tilga mos */
  const sched = [8, 9, 10, 11].map((m) => `${fmtDayMonth(new Date(2026, m, 15), locale)} · 1 450 000`);

  return (
    <div className={`lp ${onest.variable}`}>
      <SavoraJsonLd />
      {/* NAV */}
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <Link href="/" className="lp-brand"><BrandMark size={32} />Savora</Link>
          <nav className="lp-links" aria-label={L.nav.sectionsAria}>
            <a href="#nasiya">{L.nav.nasiya}</a>
            <a href="#qoidalar-2027">{L.nav.rules}</a>
            <a href="#nega-savora">{L.nav.why}</a>
            <a href="#imkoniyatlar">{L.nav.features}</a>
            <a href="#tariflar">{L.nav.plans}</a>
            <a href="#faq">{L.nav.faq}</a>
          </nav>
          <div className="lp-nav-cta">
            <ThemeToggle />
            <LangSwitch compact />
            <Link href="/login" className="lp-btn lp-btn--t lp-btn--sm">{d.common.login}</Link>
            <Link href={LOCALHOST_LINKS.register} className="lp-btn lp-btn--f lp-btn--sm">{L.nav.start}</Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <span className="lp-pill-top"><b>{tr(L.hero.trial, { days: TRIAL_DAYS })}</b> {L.hero.noCard}</span>
            <h1 className="lp-h1">
              <RotatingWord />
              <span className="lp-l2">{L.hero.line2}</span>
            </h1>
            <p className="lp-sub">{L.hero.sub}</p>
            <div className="lp-cta">
              <Link href={LOCALHOST_LINKS.register} className="lp-btn lp-btn--f lp-btn--lg">{L.hero.ctaStart}</Link>
              <a href="#demo" className="lp-btn lp-btn--g lp-btn--lg">{L.hero.ctaDemo}</a>
            </div>
            <div className="lp-stats">
              <div><b><CountUp to={sectors.length} /></b><span>{L.hero.statSectors}</span></div>
              <div><b>{L.hero.statMin}</b><span>{L.hero.statMinL}</span></div>
              <div><b>{L.hero.stat247}</b><span>{L.hero.stat247L}</span></div>
            </div>
          </div>
          <HeroStage />
        </div>
      </section>

      {/* SOHALAR LENTASI */}
      <div className="lp-marq" aria-label={L.hero.marqueeAria}>
        <div className="lp-marq-in">
          {[...sectors, ...sectors].map((s, k) => (
            <span key={k} aria-hidden={k >= sectors.length}><i />{s}</span>
          ))}
        </div>
      </div>

      {/* NASIYA OQIMI */}
      <section className="lp-sec" id="nasiya">
        <div className="lp-wrap">
          <div className="lp-head lp-reveal">
            <span className="lp-eyebrow">{L.flow.eyebrow}</span>
            <h2>{L.flow.title}</h2>
            <p>{L.flow.lead}</p>
          </div>
          <div className="lp-flow">
            {L.flow.steps.map((f, i) => (
              <div key={f.t} className="lp-reveal">
                <span className="ic"><Svg>{FLOW_ICONS[i]}</Svg></span>
                <span className="n">{String(i + 1).padStart(2, '0')}</span>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2027 QOIDALARI (PQ-294) */}
      <section className="lp-sec lp-sec--alt" id="qoidalar-2027">
        <div className="lp-wrap">
          <div className="lp-head lp-reveal">
            <span className="lp-eyebrow">{L.pq.eyebrow}</span>
            <h2>{L.pq.title}</h2>
            <p>{L.pq.lead}</p>
          </div>
          <div className="lp-pq">
            <div className="lp-pq-lims lp-reveal">
              <div><b>{tr(L.pq.months, { n: PQ294_MAX_MONTHS })}</b><span>{L.pq.monthsL}</span></div>
              <div><b>{tr(L.pq.bhm, { n: PQ294_MAX_BHM })}</b><span>{tr(L.pq.bhmL, { m: Math.round(PQ294_MAX_AMOUNT / 1_000_000) })}</span></div>
              <div><b>{PQ294_MAX_EXTRA_PCT_YEAR}%</b><span>{L.pq.pctL}</span></div>
              <div><b>{L.pq.zero}</b><span>{L.pq.zeroL}</span></div>
              <p className="lp-pq-note">{L.pq.note}</p>
            </div>
            <div className="lp-pq-help lp-reveal">
              <h3>{L.pq.helpTitle}</h3>
              <ul>
                {L.pq.help.map((t, i) => (
                  <li key={t}>
                    <span className={`lp-pq-st lp-pq-st--${PQ_HELP_STATUS[i]}`}>{PQ_HELP_STATUS[i] === 'ready' ? L.pq.ready : L.pq.soon}</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              <Link href="/help#pq-294" className="lp-btn lp-btn--t">{L.pq.readRules}</Link>
            </div>
          </div>
          <p className="lp-src">{L.pq.source}</p>
        </div>
      </section>

      {/* NEGA SAVORA — BNPL komissiyasi bilan taqqoslash */}
      <section className="lp-sec" id="nega-savora">
        <div className="lp-wrap">
          <div className="lp-head lp-reveal">
            <span className="lp-eyebrow">{L.why.eyebrow}</span>
            <h2>{L.why.title}</h2>
            <p>{tr(L.why.lead, { price: money(EX_PRICE) })}</p>
          </div>
          <div className="lp-why">
            <div className="lp-why-c lp-reveal">
              <span className="lp-why-k">{L.why.notebook.k}</span>
              <b className="lp-why-v">{L.why.notebook.v}</b>
              <span className="lp-why-s">{L.why.notebook.s}</span>
              <ul>{L.why.notebook.items.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            <div className="lp-why-c lp-reveal">
              <span className="lp-why-k">{L.why.bnpl.k}</span>
              <b className="lp-why-v lp-why-v--neg">−{money(bnplFee)}</b>
              <span className="lp-why-s">{tr(L.why.bnpl.s, { pct: Math.round(EX_BNPL_FEE * 100) })}</span>
              <ul>{L.why.bnpl.items.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            <div className="lp-why-c lp-why-c--sv lp-reveal">
              <span className="lp-why-k">{L.why.savora.k}</span>
              <b className="lp-why-v">{money(proPrice)}</b>
              <span className="lp-why-s">{L.why.savora.s}</span>
              <ul>{L.why.savora.items.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          </div>
          <p className="lp-src">{L.why.source}</p>
        </div>
      </section>

      {/* DEMO */}
      <div className="lp-sec--alt">
        <ProductShowcase />
      </div>

      {/* IMKONIYATLAR — bento */}
      <section className="lp-sec" id="imkoniyatlar">
        <div className="lp-wrap">
          <div className="lp-head lp-reveal">
            <span className="lp-eyebrow">{L.features.eyebrow}</span>
            <h2>{L.features.title}</h2>
            <p>{L.features.lead}</p>
          </div>
          <div className="lp-bento">
            <div className="lp-tile lp-tile--big lp-reveal">
              <h3>{L.features.nasiya.t}</h3>
              <p>{L.features.nasiya.d}</p>
              <div className="lp-sched">
                <div><span>{sched[0]}</span><i className="ok">{L.features.schedPaid}</i></div>
                <div><span>{sched[1]}</span><i className="now">{L.features.schedToday}</i></div>
                <div><span>{sched[2]}</span><i className="wait">{L.features.schedWait}</i></div>
                <div><span>{sched[3]}</span><i className="wait">{L.features.schedWait}</i></div>
              </div>
            </div>
            <div className="lp-tile lp-reveal"><span className="ic"><Svg>{P.scan}</Svg></span><h3>{L.features.kassa.t}</h3><p>{L.features.kassa.d}</p></div>
            <div className="lp-tile lp-reveal"><span className="ic"><Svg>{P.phone}</Svg></span><h3>{L.features.imei.t}</h3><p>{L.features.imei.d}</p></div>
            <div className="lp-tile lp-tile--wide lp-reveal"><span className="ic"><Svg>{P.users}</Svg></span><h3>{L.features.perms.t}</h3><p>{L.features.perms.d}</p>
              <div className="lp-chiprow">{L.features.permChips.map((c) => <span key={c}>{c}</span>)}</div>
            </div>
            <div className="lp-tile lp-tile--wide lp-reveal"><span className="ic"><Svg>{P.branch}</Svg></span><h3>{L.features.branches.t}</h3><p>{L.features.branches.d}</p></div>
            <div className="lp-tile lp-reveal"><span className="ic"><Svg>{P.chart}</Svg></span><h3>{L.features.reports.t}</h3><p>{L.features.reports.d}</p></div>
            <div className="lp-tile lp-reveal"><span className="ic"><Svg>{P.box}</Svg></span><h3>{L.features.stock.t}</h3><p>{L.features.stock.d}</p></div>
            <div className="lp-tile lp-reveal"><span className="ic"><Svg>{P.shield}</Svg></span><h3>{L.features.security.t}</h3><p>{L.features.security.d}</p></div>
          </div>
        </div>
      </section>

      {/* SOHALAR */}
      <section className="lp-sec lp-sec--alt" id="sohalar">
        <div className="lp-wrap">
          <div className="lp-head lp-reveal">
            <span className="lp-eyebrow">{tr(L.sectors.eyebrow, { n: sectorCards.length })}</span>
            <h2>{L.sectors.title}</h2>
            <p>{L.sectors.lead}</p>
          </div>
          <div className="lp-sectors">
            {sectorCards.map((s) => (
              <div key={s.id} className="lp-sector lp-reveal">
                <span className="ic"><Icon name={s.icon} size={20} /></span>
                <b>{s.label}</b>
                <small>{s.description}</small>
                {s.tags.length > 0 && <div className="lp-sector-tags">{s.tags.map((t) => <i key={t}>{t}</i>)}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI YORDAMCHI */}
      <section className="lp-sec" id="ai">
        <div className="lp-wrap">
          <div className="lp-head lp-reveal">
            <span className="lp-eyebrow">{L.ai.eyebrow}</span>
            <h2>{L.ai.title}</h2>
            <p>{L.ai.lead}</p>
          </div>
          <div className="lp-ai">
            {L.ai.roles.map((r, i) => (
              <div key={r.who} className="lp-ai-c lp-reveal">
                <span className="ic"><Svg>{AI_ICONS[i]}</Svg></span>
                <span className="lp-ai-who">{r.who}</span>
                <p className="lp-ai-q">{r.q}</p>
                <p>{r.d}</p>
              </div>
            ))}
          </div>
          <p className="lp-src">{L.ai.note}</p>
        </div>
      </section>

      {/* TAQQOSLASH */}
      <section className="lp-sec lp-sec--alt" id="taqqoslash">
        <div className="lp-wrap">
          <div className="lp-head lp-reveal">
            <span className="lp-eyebrow">{L.compare.eyebrow}</span>
            <h2>{L.compare.title}</h2>
          </div>
          <div className="lp-cmp lp-reveal">
            <div className="lp-cmp-row lp-cmp-head"><span>&nbsp;</span><span>{L.compare.colOld}</span><span className="sv">Savora</span></div>
            {L.compare.rows.map((c) => (
              <div key={c} className="lp-cmp-row"><span>{c}</span><span className="lp-x" aria-label={L.compare.no}>✕</span><span className="lp-ck" aria-label={L.compare.yes}>✓</span></div>
            ))}
          </div>
        </div>
      </section>

      {/* SHARHLAR */}
      {reviews.length > 0 && (
        <section className="lp-sec" id="sharhlar">
          <div className="lp-wrap">
            <div className="lp-head lp-reveal">
              <span className="lp-eyebrow">{L.reviews.eyebrow}</span>
              <h2>{L.reviews.title}</h2>
            </div>
            <div className="lp-revs">
              {reviews.map((r) => (
                <figure key={r.id} className="lp-rev lp-reveal">
                  <div className="lp-stars" aria-label={tr(L.reviews.stars, { n: r.rating })}>{'★'.repeat(r.rating)}<span>{'★'.repeat(5 - r.rating)}</span></div>
                  <blockquote>{r.comment}</blockquote>
                  <figcaption><span className="lp-av">{initialsOf(r.authorName || r.shopName)}</span><span><b>{r.authorName || d.common.customer}</b><small>{r.shopName}</small></span></figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* TARIFLAR */}
      <section className="lp-sec" id="tariflar">
        <div className="lp-wrap">
          <div className="lp-head lp-reveal">
            <span className="lp-eyebrow">{L.plans.eyebrow}</span>
            <h2>{L.plans.title}</h2>
            <p>{tr(L.plans.lead, { days: TRIAL_DAYS })}</p>
          </div>
          <div className="lp-plans">
            {plans.map((p) => (
              <div key={p.name} className={`lp-plan lp-reveal${p.featured ? ' lp-plan--f' : ''}`}>
                {p.featured && <span className="lp-plan-tag">{L.plans.popular}</span>}
                <div className="lp-plan-name">{p.name}</div>
                <div className="lp-plan-desc">{p.desc}</div>
                <div className="lp-plan-price">{p.price}{!p.isFree && <span> {L.plans.perMonth}</span>}</div>
                <ul>{p.feats.map((ft) => <li key={ft}><Svg size={16}>{P.check}</Svg>{ft}</li>)}</ul>
                <Link href={LOCALHOST_LINKS.register} className={`lp-btn ${p.featured ? 'lp-btn--w' : 'lp-btn--f'}`}>{L.plans.tryFree}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Faq trialDays={TRIAL_DAYS} plans={planLimits} />

      {/* MOBIL ILOVA — havola env'da bo'lmasa «Tez kunda» */}
      <section className="lp-sec lp-sec--alt" id="ilova">
        <div className="lp-wrap">
          <div className="lp-head lp-reveal">
            <span className="lp-eyebrow">{L.mobileApp.eyebrow}</span>
            <h2>{L.mobileApp.title}</h2>
            <p>{L.mobileApp.lead}</p>
          </div>
          <div className="lp-dl">
            {[
              { key: 'android', icon: P.android, t: L.mobileApp.android, d: L.mobileApp.androidD, btn: L.mobileApp.androidBtn, href: MOBILE_ANDROID_URL },
              { key: 'ios', icon: P.apple, t: L.mobileApp.ios, d: L.mobileApp.iosD, btn: L.mobileApp.iosBtn, href: MOBILE_IOS_URL },
            ].map((s) => (
              <div key={s.key} className="lp-tile lp-dl-card lp-reveal">
                <span className="ic"><Svg>{s.icon}</Svg></span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
                {s.href
                  ? <a href={s.href} className="lp-btn lp-btn--f" rel="noopener">{s.btn}</a>
                  : <span className="lp-btn lp-btn--g" aria-disabled="true">{L.mobileApp.soon}</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="lp-sec">
        <div className="lp-wrap">
          <div className="lp-ctab lp-reveal">
            <svg className="lp-girih" viewBox="0 0 600 600" aria-hidden="true"><defs><pattern id="lp-cta-p" width="75" height="75" patternUnits="userSpaceOnUse"><g fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="17.5" y="17.5" width="40" height="40" /><rect x="17.5" y="17.5" width="40" height="40" transform="rotate(45 37.5 37.5)" /><circle cx="37.5" cy="37.5" r="9" /></g></pattern></defs><rect width="600" height="600" fill="url(#lp-cta-p)" /></svg>
            <h2>{L.cta.title}</h2>
            <p>{tr(L.cta.lead, { days: TRIAL_DAYS })}</p>
            <div className="lp-ctab-row"><Link href={LOCALHOST_LINKS.register} className="lp-btn lp-btn--w lp-btn--lg">{L.cta.register}</Link><Link href="/contact" className="lp-btn lp-btn--ghost lp-btn--lg">{L.cta.demo}</Link></div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-foot">
        <div className="lp-wrap">
          <div className="lp-foot-grid">
            <div>
              <Link href="/" className="lp-brand"><BrandMark size={32} />Savora</Link>
              <p style={{ color: 'var(--lp-ink2)', maxWidth: 300, marginTop: 12 }}>{L.footer.tagline}</p>
            </div>
            <div><h4>{L.footer.product}</h4><a href="#imkoniyatlar">{L.nav.features}</a><a href="#tariflar">{L.nav.plans}</a><a href="#sohalar">{L.footer.sectors}</a><a href="#qoidalar-2027">{L.footer.rules}</a><a href="#ilova">{L.mobileApp.eyebrow}</a><Link href={LOCALHOST_LINKS.register}>{L.footer.trial}</Link></div>
            <div><h4>{L.footer.company}</h4><Link href="/contact">{L.public.contact}</Link><Link href="/help">{L.public.helpCenter}</Link></div>
            <div><h4>{L.footer.docs}</h4><Link href="/terms">{L.public.terms}</Link><Link href="/privacy">{L.public.privacy}</Link></div>
          </div>
          <div className="lp-foot-bot">
            <span>© {new Date().getFullYear()} Savora. {L.footer.rights}</span>
            <span>{L.footer.madeIn}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
