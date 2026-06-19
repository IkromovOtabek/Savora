import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAppZone } from '@/lib/tenantContext';
import { getCurrentUser } from '@/lib/auth';
import { superDashboardUrl } from '@/lib/urls';
import { fmtPlanPrice } from '@/lib/plans';
import { getEffectivePlanPresets } from '@/lib/platformSettings';
import { LOCALHOST_LINKS } from '@/lib/urls';
import LoginPortal from '@/components/landing/LoginPortal';
import Icon from '@/components/icons/Icon';
import ThemeToggle from '@/components/ThemeToggle';

const ICONS = {
  box: <path d="M3 7l9-4 9 4v10l-9 4-9-4V7z M3 7l9 4 9-4 M12 11v10" />,
  cart: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></>,
  credit: <><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></>,
  chart: <><path d="M6 20 L12 6" /><path d="M12 6 L18 20" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>,
  search: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  branch: <><circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="M6 9v6a3 3 0 0 0 3 3h6" /></>,
  bolt: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
};

function FeatureIcon({ d, bg }: { d: React.ReactNode; bg: string }) {
  return (
    <span className="ic" style={{ background: bg }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
    </span>
  );
}

const G = 'linear-gradient(135deg,#4f46e5,#7c3aed)';
const Gr = 'linear-gradient(135deg,#10b981,#059669)';
const Go = 'linear-gradient(135deg,#f59e0b,#ef4444)';

const FEATURES = [
  { icon: ICONS.box, bg: G, t: 'Ombor boshqaruvi', d: 'Har bir mahsulot, IMEI, narx va holatini real vaqtda kuzating. Kelgan/qo\'shilgan/sotilgan — hammasi bir joyda.' },
  { icon: ICONS.cart, bg: Gr, t: 'Sotuv va nasiya', d: 'Naqd, qarz, kredit, variant (bo\'lib to\'lash) — barcha yo\'nalishlar. Mijoz va to\'lov nazorati.' },
  { icon: ICONS.credit, bg: Go, t: 'Kassa va kredit kassa', d: 'Naqd va bank kreditlari bo\'yicha kassani aniq yuriting. Har banki bo\'yicha qoldiq va hisobot.' },
  { icon: ICONS.chart, bg: G, t: 'Monitoring va analitika', d: 'Oylik kirim/chiqim/foyda avtomatik hisoblanadi. Filiallar bo\'yicha taqqoslama statistika.' },
  { icon: ICONS.branch, bg: Gr, t: 'Ko\'p filial', d: 'Cheksiz filial qo\'shing, mahsulotni filiallar aro yuboring va har birini alohida kuzating.' },
  { icon: ICONS.users, bg: Go, t: 'Rol boshqaruvi', d: 'Do\'kon egasi xodimlarga login ochadi, ruxsatlarni belgilaydi. Har kim o\'z darajasini ko\'radi.' },
  { icon: ICONS.search, bg: G, t: 'Tezkor IMEI qidiruv', d: 'Bir nechta IMEI ni bir vaqtda qidiring, xatolarni toping, Excel bilan solishtiring.' },
  { icon: ICONS.bolt, bg: Gr, t: 'Tez va ishonchli', d: 'Bulutli infratuzilma, avtomatik zaxira nusxa va yuqori tezlik — istalgan qurilmadan.' },
  { icon: ICONS.shield, bg: Go, t: 'To\'liq xavfsizlik', d: 'Har do\'kon ma\'lumoti alohida bazada izolyatsiya qilinadi. Hech kim boshqa do\'konni ko\'rmaydi.' },
];

const PLANS_STATIC = [
  { tier: 'starter' as const, featured: false },
  { tier: 'pro' as const, featured: true },
  { tier: 'business' as const, featured: false },
];

export default async function LandingPage() {
  const zone = await getAppZone();
  if (zone !== 'root') {
    const user = await getCurrentUser();
    if (zone === 'super') redirect(user ? superDashboardUrl('/super') : '/super/login');
    redirect(user ? '/app' : '/login');
  }

  const presets = await getEffectivePlanPresets();
  const plans = PLANS_STATIC.map(({ tier, featured }) => {
    const p = presets[tier];
    return {
      name: p.label,
      desc: p.description,
      price: fmtPlanPrice(p.monthlyPrice),
      featured,
      feats: p.marketingFeatures,
    };
  });

  return (
    <>
      {/* NAV */}
      <header className="nav">
        <div className="container nav-inner">
          <div className="brand">
            <span className="brand-logo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 20 L12 6" stroke="var(--ink-1)" /><path d="M12 6 L18 20" stroke="var(--brand)" /></svg>
            </span>
            Savora
          </div>
          <nav className="nav-links">
            <a href="#features">Imkoniyatlar</a>
            <a href="#pricing">Tariflar</a>
            <a href="#kirish">Kirish</a>
            <a href="#why">Nega biz?</a>
          </nav>
          <div className="nav-cta">
            <ThemeToggle />
            <Link href="#kirish" className="btn btn-ghost btn-with-icon">
              <Icon name="login" size={16} />
              Kirish
            </Link>
            <Link href={LOCALHOST_LINKS.register} className="btn btn-primary btn-with-icon">
              <Icon name="signup" size={16} />
              Ro&apos;yxatdan o&apos;tish
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="badge"><span className="badge-dot" /> 7 kun bepul sinov — karta talab qilinmaydi</span>
            <h1>Do'koningizni <span className="grad">bitta tizimdan</span> boshqaring</h1>
            <p className="hero-sub">
              Savora — ombor, sotuv, nasiya, kassa, filiallar va xodimlarni bir joyda. Zamonaviy,
              tez va ishonchli. O'zbekiston do'konlari uchun maxsus yaratilgan.
            </p>
            <div className="hero-cta">
              <Link href={LOCALHOST_LINKS.register} className="btn btn-primary btn-lg btn-with-icon">
                <Icon name="signup" size={20} />
                Ro&apos;yxatdan o&apos;tish — bepul boshlash
              </Link>
              <a href="#kirish" className="btn btn-ghost btn-lg btn-with-icon">
                <Icon name="login" size={20} />
                Kirish
              </a>
            </div>
            <div className="hero-trust">
              <span className="btn-with-icon"><Icon name="check" size={16} className="trust-check" /> Kredit karta kerak emas</span>
              <span className="btn-with-icon"><Icon name="check" size={16} className="trust-check" /> 5 daqiqada sozlash</span>
              <span className="btn-with-icon"><Icon name="check" size={16} className="trust-check" /> Istalgan vaqt bekor qilish</span>
            </div>
          </div>

          {/* Mockup */}
          <div className="hero-visual">
            <div className="mock">
              <div className="mock-top">
                <span className="mock-dot" style={{ background: '#ef4444' }} />
                <span className="mock-dot" style={{ background: '#f59e0b' }} />
                <span className="mock-dot" style={{ background: '#10b981' }} />
              </div>
              <div className="mock-body">
                <div className="mock-row">
                  <div className="mock-kpi"><div className="lbl">Bugungi sotuv</div><div className="val up">42 380 000</div></div>
                  <div className="mock-kpi"><div className="lbl">Foyda</div><div className="val up">8 120 000</div></div>
                </div>
                <div className="mock-bars">
                  {[55, 80, 45, 95, 70, 88, 60].map((h, i) => (
                    <span key={i} className="mock-bar" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="float-card float-1">
              <span className="ic" style={{ background: Gr }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              </span>
              Sotuv +24%
            </div>
            <div className="float-card float-2">
              <span className="ic" style={{ background: G }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" /></svg>
              </span>
              1 240 mahsulot
            </div>
          </div>
        </div>
      </section>

      <LoginPortal />

      {/* STATS */}
      <section className="section section--soft">
        <div className="container stats">
          <div className="stat"><div className="n">500+</div><div className="t">Faol do'konlar</div></div>
          <div className="stat"><div className="n">2M+</div><div className="t">Yozuvlar</div></div>
          <div className="stat"><div className="n">99.9%</div><div className="t">Ish vaqti</div></div>
          <div className="stat"><div className="n">24/7</div><div className="t">Qo'llab-quvvatlash</div></div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="section" id="features">
        <div className="container">
          <div className="head">
            <span className="eyebrow">Imkoniyatlar</span>
            <h2>Biznesingiz uchun barcha kerakli vositalar</h2>
            <p>OneNasiya tajribasidan kelib chiqib yanada kengaytirilgan — do'koningizni to'liq raqamlashtiring.</p>
          </div>
          <div className="features">
            {FEATURES.map((f) => (
              <div key={f.t} className="feature">
                <FeatureIcon d={f.icon} bg={f.bg} />
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY / TRUST */}
      <section className="section section--soft" id="why">
        <div className="container">
          <div className="head">
            <span className="eyebrow">Nega Savora?</span>
            <h2>Ishonch — bizning poydevorimiz</h2>
            <p>Ma'lumotlaringiz xavfsiz, tizim doim ishlaydi, jamoamiz har doim yoningizda.</p>
          </div>
          <div className="features">
            <div className="feature"><FeatureIcon d={ICONS.shield} bg={G} /><h3>Izolyatsiyalangan ma'lumot</h3><p>Har do'kon o'z alohida bazasida. Boshqa hech kim ma'lumotingizga kira olmaydi.</p></div>
            <div className="feature"><FeatureIcon d={ICONS.bolt} bg={Gr} /><h3>Avtomatik zaxira</h3><p>Ma'lumotlaringiz muntazam zaxiralanadi — hech narsa yo'qolmaydi.</p></div>
            <div className="feature"><FeatureIcon d={ICONS.users} bg={Go} /><h3>Doimiy yordam</h3><p>Telegram va telefon orqali tezkor qo'llab-quvvatlash. Sozlashda yordam beramiz.</p></div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="section" id="pricing">
        <div className="container">
          <div className="head">
            <span className="eyebrow">Tariflar</span>
            <h2>Sizga mos tarifni tanlang</h2>
            <p>Barcha tariflar <strong>7 kun bepul</strong> sinovdan boshlanadi. Karta talab qilinmaydi.</p>
          </div>
          <div className="pricing">
            {plans.map((p) => (
              <div key={p.name} className={`plan${p.featured ? ' plan--featured' : ''}`}>
                {p.featured && <span className="plan-tag">Eng ommabop</span>}
                <div className="plan-name">{p.name}</div>
                <div className="plan-desc">{p.desc}</div>
                <div className="plan-price">{p.price} <span>so'm/oy</span></div>
                <ul className="plan-feat">
                  {p.feats.map((ft) => (
                    <li key={ft}><span className="ck"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></span>{ft}</li>
                  ))}
                </ul>
                <Link href={LOCALHOST_LINKS.register} className={`btn btn-with-icon ${p.featured ? 'btn-white' : 'btn-primary'}`}>
                  <Icon name="signup" size={16} />
                  Ro&apos;yxatdan o&apos;tish — 7 kun bepul
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section">
        <div className="container">
          <div className="cta-band">
            <h2>Bugun bepul boshlang</h2>
            <p>7 kun davomida barcha imkoniyatlardan bepul foydalaning. Yoqsa — davom etasiz, yoqmasa — bekor qilasiz.</p>
            <Link href={LOCALHOST_LINKS.register} className="btn btn-white btn-lg btn-with-icon">
              <Icon name="signup" size={20} />
              Ro&apos;yxatdan o&apos;tish
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div style={{ maxWidth: 280 }}>
              <div className="brand" style={{ marginBottom: 12 }}>
                <span className="brand-logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 20 L12 6" stroke="var(--ink-1)" /><path d="M12 6 L18 20" stroke="var(--brand)" /></svg></span>
                Savora
              </div>
              <p style={{ fontSize: '.92rem', color: 'var(--ink-2)' }}>Do'konlar uchun zamonaviy savdo va nasiya boshqaruv platformasi.</p>
            </div>
            <div className="footer-col"><h4>Mahsulot</h4><a href="#features">Imkoniyatlar</a><a href="#pricing">Tariflar</a><Link href="/register">Bepul sinov</Link></div>
            <div className="footer-col"><h4>Kompaniya</h4><a href="#why">Biz haqimizda</a><Link href="/contact">Bog&apos;lanish</Link></div>
            <div className="footer-col"><h4>Hujjatlar</h4><Link href="/privacy">Maxfiylik</Link><Link href="/terms">Shartlar</Link><Link href="/help">Yordam</Link></div>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} Savora. Barcha huquqlar himoyalangan.</span>
            <span className="btn-with-icon footer-made">
              O&apos;zbekistonda <Icon name="heart" size={14} className="footer-heart" /> bilan yaratilgan
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}
