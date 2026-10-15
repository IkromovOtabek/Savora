import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Onest, Unbounded } from 'next/font/google';
import { getAppZone } from '@/lib/tenantContext';
import { getCurrentUser } from '@/lib/auth';
import { superDashboardUrl } from '@/lib/urls';
import { fmtPlanPrice } from '@/lib/plans';
import { getEffectivePlanPresets } from '@/lib/platformSettings';
import { getLatestReviews } from '@/lib/reviews';
import { LOCALHOST_LINKS } from '@/lib/urls';
import { BUSINESS_TYPES, BUSINESS_TYPE_IDS } from '@/lib/businessTypes';
import ProductShowcase from '@/components/landing/ProductShowcase';
import Faq from '@/components/landing/Faq';
import { RotatingWord, HeroStage, CountUp } from '@/components/landing/HeroMotion';
import ThemeToggle from '@/components/ThemeToggle';
import BrandMark from '@/components/BrandMark';
import '@/components/landing/landing.css';

const onest = Onest({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '600', '700', '800'], variable: '--font-onest', display: 'swap' });
const unbounded = Unbounded({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-unbounded', display: 'swap' });

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
};

const FLOW = [
  { ic: P.cart, t: 'Tovarni tanlang', d: 'Skaner yoki qidiruv bilan savatga qo\'shing — bir nechta tovar, miqdor va chegirma bilan.' },
  { ic: P.cal, t: 'Jadval tayyor', d: 'Boshlang\'ich to\'lov va muddatni tanlang — oylik to\'lov va sanalar darhol hisoblanadi.' },
  { ic: P.sign, t: 'Shartnoma imzolanadi', d: 'Mijoz ma\'lumotlari bilan shartnoma avtomatik to\'ldiriladi va SMS-kod orqali tasdiqlanadi.' },
  { ic: P.bell, t: 'Pul o\'z vaqtida', d: 'To\'lov kunidan oldin eslatma, kechiksa — bosqichma-bosqich undirish va hisobot.' },
];

const COMPARE = [
  'Nasiya jadvali va eslatmalar avtomatik',
  'Shartnoma bir tugmada, SMS-kod bilan',
  'IMEI va ombor nazorati',
  'Bir nechta filial bitta ekranda',
  'Xodimlarga alohida huquqlar',
  'Telefondan istalgan joyda',
];

const PLANS_STATIC = [
  { tier: 'starter' as const, featured: false },
  { tier: 'pro' as const, featured: true },
  { tier: 'business' as const, featured: false },
];

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

  const reviews = await getLatestReviews(6);
  const presets = await getEffectivePlanPresets();
  const plans = PLANS_STATIC.map(({ tier, featured }) => {
    const p = presets[tier];
    return { name: p.label, desc: p.description, price: fmtPlanPrice(p.monthlyPrice), featured, feats: p.marketingFeatures };
  });
  const sectors = BUSINESS_TYPE_IDS.map((id) => BUSINESS_TYPES[id].label);

  return (
    <div className={`lp ${onest.variable} ${unbounded.variable}`}>
      {/* NAV */}
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <Link href="/" className="lp-brand"><BrandMark size={32} />Savora</Link>
          <nav className="lp-links" aria-label="Bo'limlar">
            <a href="#nasiya">Nasiya</a>
            <a href="#demo">Demo</a>
            <a href="#imkoniyatlar">Imkoniyatlar</a>
            <a href="#tariflar">Tariflar</a>
            <a href="#faq">Savollar</a>
          </nav>
          <div className="lp-nav-cta">
            <ThemeToggle />
            <Link href="/login" className="lp-btn lp-btn--t lp-btn--sm">Kirish</Link>
            <Link href={LOCALHOST_LINKS.register} className="lp-btn lp-btn--f lp-btn--sm">Boshlash</Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <span className="lp-pill-top"><b>{TRIAL_DAYS} kun bepul</b> Karta talab qilinmaydi</span>
            <h1 className="lp-h1">
              <RotatingWord />
              <span className="lp-l2">bitta ilovada boshqaring</span>
            </h1>
            <p className="lp-sub">Savora — ombor, kassa, nasiya va shartnomani birlashtirgan savdo tizimi. Sotuv 2 daqiqada rasmiylashadi, to&apos;lov vaqtida eslatiladi, qarz esa nazoratdan chiqmaydi.</p>
            <div className="lp-cta">
              <Link href={LOCALHOST_LINKS.register} className="lp-btn lp-btn--f lp-btn--lg">Bepul boshlash</Link>
              <a href="#demo" className="lp-btn lp-btn--g lp-btn--lg">Demoni ko&apos;rish</a>
            </div>
            <div className="lp-stats">
              <div><b><CountUp to={sectors.length} /></b><span>savdo yo&apos;nalishi</span></div>
              <div><b>2 daq</b><span>nasiya rasmiylashtirish</span></div>
              <div><b>24/7</b><span>istalgan qurilmadan</span></div>
            </div>
          </div>
          <HeroStage />
        </div>
      </section>

      {/* SOHALAR LENTASI */}
      <div className="lp-marq" aria-label="Qo'llab-quvvatlanadigan sohalar">
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
            <span className="lp-eyebrow">Nasiya oqimi</span>
            <h2>Sotuvdan undirishgacha — to&apos;rt qadam</h2>
            <p>Daftar, Excel va qo&apos;lda hisoblash yo&apos;q. Har bir nasiya shartnomada, har bir to&apos;lov nazoratda.</p>
          </div>
          <div className="lp-flow">
            {FLOW.map((f, i) => (
              <div key={f.t} className="lp-reveal">
                <span className="ic"><Svg>{f.ic}</Svg></span>
                <span className="n">{String(i + 1).padStart(2, '0')}</span>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </div>
            ))}
          </div>
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
            <span className="lp-eyebrow">Imkoniyatlar</span>
            <h2>Do&apos;koningizga kerak bo&apos;lgan hamma narsa</h2>
            <p>Telefon do&apos;konidan mebel salonigacha — har bir soha o&apos;ziga mos sozlamalar bilan boshlanadi.</p>
          </div>
          <div className="lp-bento">
            <div className="lp-tile lp-tile--big lp-reveal">
              <h3>Nasiya — bank darajasida</h3>
              <p>Ustama, boshlang&apos;ich to&apos;lov, oylik jadval, kafil va muddatidan oldin yopish. Har oy holati bir qarashda ko&apos;rinadi.</p>
              <div className="lp-sched">
                <div><span>15-sentabr · 1 450 000</span><i className="ok">To&apos;landi</i></div>
                <div><span>15-oktabr · 1 450 000</span><i className="now">Bugun</i></div>
                <div><span>15-noyabr · 1 450 000</span><i className="wait">Kutilmoqda</i></div>
                <div><span>15-dekabr · 1 450 000</span><i className="wait">Kutilmoqda</i></div>
              </div>
            </div>
            <div className="lp-tile lp-reveal"><span className="ic"><Svg>{P.scan}</Svg></span><h3>Tez kassa</h3><p>Skaner, savat, aralash to&apos;lov va chek — klaviaturadan.</p></div>
            <div className="lp-tile lp-reveal"><span className="ic"><Svg>{P.phone}</Svg></span><h3>IMEI nazorati</h3><p>Har bir telefon IMEI bo&apos;yicha, umumiy qora ro&apos;yxat bilan.</p></div>
            <div className="lp-tile lp-tile--wide lp-reveal"><span className="ic"><Svg>{P.users}</Svg></span><h3>Xodim huquqlari</h3><p>Kim narxni o&apos;zgartiradi, kim sotuvni bekor qiladi, kim kelish narxini ko&apos;radi — o&apos;zingiz belgilaysiz.</p>
              <div className="lp-chiprow"><span>Sotish</span><span>Chegirma</span><span>Bekor qilish</span><span>Kelish narxi</span><span>Hisobot</span></div>
            </div>
            <div className="lp-tile lp-tile--wide lp-reveal"><span className="ic"><Svg>{P.branch}</Svg></span><h3>Ko&apos;p filial</h3><p>Filiallar aro tovar berish, har filial kassasi va umumiy hisobot bitta ekranda.</p></div>
            <div className="lp-tile lp-reveal"><span className="ic"><Svg>{P.chart}</Svg></span><h3>Hisobotlar</h3><p>Tushum, foyda, kechikkan qarzlar va kam qolgan tovarlar.</p></div>
            <div className="lp-tile lp-reveal"><span className="ic"><Svg>{P.box}</Svg></span><h3>Ombor</h3><p>Kirim, qoldiq, inventarizatsiya va CSV eksport.</p></div>
            <div className="lp-tile lp-reveal"><span className="ic"><Svg>{P.shield}</Svg></span><h3>Xavfsizlik</h3><p>Har do&apos;kon alohida bazada, avtomatik zaxira nusxa bilan.</p></div>
          </div>
        </div>
      </section>

      {/* TAQQOSLASH */}
      <section className="lp-sec lp-sec--alt" id="taqqoslash">
        <div className="lp-wrap">
          <div className="lp-head lp-reveal">
            <span className="lp-eyebrow">Nega o&apos;tish kerak</span>
            <h2>Daftar va Excel&apos;dan farqi</h2>
          </div>
          <div className="lp-cmp lp-reveal">
            <div className="lp-cmp-row lp-cmp-head"><span>&nbsp;</span><span>Daftar / Excel</span><span className="sv">Savora</span></div>
            {COMPARE.map((c) => (
              <div key={c} className="lp-cmp-row"><span>{c}</span><span className="lp-x" aria-label="Yo'q">✕</span><span className="lp-ck" aria-label="Bor">✓</span></div>
            ))}
          </div>
        </div>
      </section>

      {/* SHARHLAR */}
      {reviews.length > 0 && (
        <section className="lp-sec" id="sharhlar">
          <div className="lp-wrap">
            <div className="lp-head lp-reveal">
              <span className="lp-eyebrow">Mijozlar fikri</span>
              <h2>Savora&apos;dan foydalanayotganlar</h2>
            </div>
            <div className="lp-revs">
              {reviews.map((r) => (
                <figure key={r.id} className="lp-rev lp-reveal">
                  <div className="lp-stars" aria-label={`${r.rating} yulduz`}>{'★'.repeat(r.rating)}<span>{'★'.repeat(5 - r.rating)}</span></div>
                  <blockquote>{r.comment}</blockquote>
                  <figcaption><span className="lp-av">{initialsOf(r.authorName || r.shopName)}</span><span><b>{r.authorName || 'Mijoz'}</b><small>{r.shopName}</small></span></figcaption>
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
            <span className="lp-eyebrow">Tariflar</span>
            <h2>Sizga mos tarifni tanlang</h2>
            <p>Har bir tarif {TRIAL_DAYS} kunlik bepul sinov bilan boshlanadi. Karta talab qilinmaydi.</p>
          </div>
          <div className="lp-plans">
            {plans.map((p) => (
              <div key={p.name} className={`lp-plan lp-reveal${p.featured ? ' lp-plan--f' : ''}`}>
                {p.featured && <span className="lp-plan-tag">Eng ommabop</span>}
                <div className="lp-plan-name">{p.name}</div>
                <div className="lp-plan-desc">{p.desc}</div>
                <div className="lp-plan-price">{p.price} <span>so&apos;m/oy</span></div>
                <ul>{p.feats.map((ft) => <li key={ft}><Svg size={16}>{P.check}</Svg>{ft}</li>)}</ul>
                <Link href={LOCALHOST_LINKS.register} className={`lp-btn ${p.featured ? 'lp-btn--w' : 'lp-btn--f'}`}>Bepul sinash</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Faq />

      {/* CTA */}
      <section className="lp-sec">
        <div className="lp-wrap">
          <div className="lp-ctab lp-reveal">
            <svg className="lp-girih" viewBox="0 0 600 600" aria-hidden="true"><defs><pattern id="lp-cta-p" width="75" height="75" patternUnits="userSpaceOnUse"><g fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="17.5" y="17.5" width="40" height="40" /><rect x="17.5" y="17.5" width="40" height="40" transform="rotate(45 37.5 37.5)" /><circle cx="37.5" cy="37.5" r="9" /></g></pattern></defs><rect width="600" height="600" fill="url(#lp-cta-p)" /></svg>
            <h2>Nasiyani nazorat qiling, pulni vaqtida oling</h2>
            <p>{TRIAL_DAYS} kun barcha imkoniyatlar bepul. Ma&apos;lumotlaringizni ko&apos;chirishda yordam beramiz.</p>
            <Link href={LOCALHOST_LINKS.register} className="lp-btn lp-btn--w lp-btn--lg">Ro&apos;yxatdan o&apos;tish</Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-foot">
        <div className="lp-wrap">
          <div className="lp-foot-grid">
            <div>
              <Link href="/" className="lp-brand"><BrandMark size={32} />Savora</Link>
              <p style={{ color: 'var(--lp-ink2)', maxWidth: 300, marginTop: 12 }}>Do&apos;konlar uchun savdo, ombor, nasiya va shartnoma platformasi.</p>
            </div>
            <div><h4>Mahsulot</h4><a href="#imkoniyatlar">Imkoniyatlar</a><a href="#tariflar">Tariflar</a><Link href={LOCALHOST_LINKS.register}>Bepul sinov</Link></div>
            <div><h4>Kompaniya</h4><Link href="/contact">Bog&apos;lanish</Link><Link href="/help">Yordam</Link></div>
            <div><h4>Hujjatlar</h4><Link href="/privacy">Maxfiylik</Link><Link href="/terms">Shartlar</Link></div>
          </div>
          <div className="lp-foot-bot">
            <span>© {new Date().getFullYear()} Savora. Barcha huquqlar himoyalangan.</span>
            <span>O&apos;zbekistonda yaratilgan</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
