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
import { BUSINESS_TYPES, BUSINESS_TYPE_IDS, TERMS } from '@/lib/businessTypes';
import { presetFor } from '@/lib/businessPresets';
import { PQ294_MAX_MONTHS, PQ294_MAX_BHM, PQ294_MAX_AMOUNT, PQ294_MAX_EXTRA_PCT_YEAR } from '@/lib/pq294';
import Icon from '@/components/icons/Icon';
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
  { ic: P.sign, t: 'Mijoz kartasi', d: 'Mijoz, jadval va har bir to\'lov bitta kartada — kim qancha qarz, qachon to\'laydi, bir qarashda.' },
  { ic: P.bell, t: 'Pul o\'z vaqtida', d: 'To\'lov kunidan oldin eslatma, kechiksa — bosqichma-bosqich undirish va hisobot.' },
];

const COMPARE = [
  'Nasiya jadvali va eslatmalar avtomatik',
  'Kechikkan to\'lovlar har kuni Telegram\'da',
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

/** 2027 (PQ-294) — Savora qanday yordam beradi. Holat halol: faqat bor narsa "Bor". */
const PQ_HELP: { t: string; s: 'ready' | 'soon' }[] = [
  { t: 'Har nasiya jadvali, to\'lovi va qoldig\'i bitta joyda — tekshiruvga tayyor tarix', s: 'ready' },
  { t: 'Kechikkan to\'lovlar har kuni Telegram\'da, mijozga muloyim eslatma bir tugmada', s: 'ready' },
  { t: 'Har xodim amali jurnalda: kim sotdi, kim chegirma berdi, kim bekor qildi', s: 'ready' },
  { t: '12 oy va yillik 50% chegarasidan oshsa — sotuvda ogohlantirish', s: 'soon' },
  { t: 'Narx tarkibi alohida: naqd narx, ustama, jami — mijozga ochiq', s: 'soon' },
  { t: 'Choraklik aylanma va nasiya ulushi monitori (500 mln / 50%)', s: 'soon' },
];

const AI_ROLES: { who: string; ic: React.ReactNode; q: string; d: string }[] = [
  { who: 'Ega', ic: P.chart, q: '«Bu oy qaysi filial orqada qoldi?»', d: 'Tushum, foyda va nasiya portfeli bo\'yicha qisqa xulosa va e\'tibor talab qiladigan joylar.' },
  { who: 'Direktor', ic: P.users, q: '«Kechikkan 10 ta mijozni sotuvchilarga taqsimla»', d: 'Topshiriqlar: kim, nima, qachongacha — bajarilishini kuzatish.' },
  { who: 'Xodim', ic: P.check, q: '«Bugun menga nima topshirilgan?»', d: 'Qo\'ng\'iroqlar, inventar va eslatmalar ro\'yxati — faqat o\'z filiali doirasida.' },
];

/** BNPL komissiyasi bilan taqqoslash misoli (taxminiy, ochiq manbalar) */
const EX_PRICE = 10_000_000;
const EX_BNPL_FEE = 0.3;

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
  const sectorCards = BUSINESS_TYPE_IDS.map((id) => {
    const pre = presetFor(id);
    const tags = [
      TERMS[id].hasImei && 'IMEI',
      pre.nasiya && 'Nasiya',
      pre.creditKassa && 'Bank krediti',
      pre.daftar && 'Qarz daftari',
      pre.mediaUpload && 'Rasmli katalog',
      pre.inventory && 'Inventar',
    ].filter(Boolean) as string[];
    return { id, ...BUSINESS_TYPES[id], tags: tags.slice(0, 3) };
  });
  const lim = (n: number, unit: string) => (n >= 999 ? `cheksiz ${unit}` : `${n} ${unit}`);
  const limits = PLANS_STATIC.map(({ tier }) => {
    const p = presets[tier];
    return `${p.label} — ${lim(p.maxFilial, 'filial')} / ${lim(p.maxUsers, 'xodim')}`;
  }).join(', ');
  const proPrice = presets.pro.monthlyPrice;
  const bnplFee = Math.round(EX_PRICE * EX_BNPL_FEE);

  return (
    <div className={`lp ${onest.variable} ${unbounded.variable}`}>
      {/* NAV */}
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <Link href="/" className="lp-brand"><BrandMark size={32} />Savora</Link>
          <nav className="lp-links" aria-label="Bo'limlar">
            <a href="#nasiya">Nasiya</a>
            <a href="#qoidalar-2027">2027</a>
            <a href="#nega-savora">Nega Savora</a>
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
            <p className="lp-sub">Savora — ombor, kassa, nasiya va qarz nazoratini birlashtirgan savdo tizimi. Sotuv 2 daqiqada rasmiylashadi, to&apos;lov vaqtida eslatiladi, qarz esa nazoratdan chiqmaydi.</p>
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
            <p>Daftar, Excel va qo&apos;lda hisoblash yo&apos;q. Har bir nasiya jadvalda, har bir to&apos;lov nazoratda.</p>
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

      {/* 2027 QOIDALARI (PQ-294) */}
      <section className="lp-sec lp-sec--alt" id="qoidalar-2027">
        <div className="lp-wrap">
          <div className="lp-head lp-reveal">
            <span className="lp-eyebrow">1-yanvar 2027 dan</span>
            <h2>Yangi nasiya qoidalariga tayyor bo&apos;ling</h2>
            <p>PQ-294 qarori muddatli to&apos;lov uchun aniq chegaralar qo&apos;ydi. Qo&apos;lda, daftarda ularni kuzatish qiyin — Savora&apos;da har bir nasiya hisobda.</p>
          </div>
          <div className="lp-pq">
            <div className="lp-pq-lims lp-reveal">
              <div><b>{PQ294_MAX_MONTHS} oy</b><span>eng uzun muddat</span></div>
              <div><b>{PQ294_MAX_BHM} BHM</b><span>bitta xarid, ≈{Math.round(PQ294_MAX_AMOUNT / 1_000_000)} mln so&apos;m</span></div>
              <div><b>{PQ294_MAX_EXTRA_PCT_YEAR}%</b><span>yiliga: ustama + komissiya + penya</span></div>
              <div><b>0 so&apos;m</b><span>muddatidan oldin yopishda jarima</span></div>
              <p className="lp-pq-note">Choraklik aylanmasi 500 mln so&apos;mdan oshgan va savdosining yarmi yoki ko&apos;prog&apos;i nasiya bo&apos;lgan do&apos;konlar Markaziy bank reyestriga kirishi, mijozni raqamli identifikatsiya qilishi va kredit byurosiga ma&apos;lumot berishi kerak bo&apos;lishi mumkin.</p>
            </div>
            <div className="lp-pq-help lp-reveal">
              <h3>Savora qanday yordam beradi</h3>
              <ul>
                {PQ_HELP.map((h) => (
                  <li key={h.t}>
                    <span className={`lp-pq-st lp-pq-st--${h.s}`}>{h.s === 'ready' ? 'Bor' : 'Tez orada'}</span>
                    <span>{h.t}</span>
                  </li>
                ))}
              </ul>
              <Link href="/help#pq-294" className="lp-btn lp-btn--t">Qoidalarni oddiy tilda o&apos;qish</Link>
            </div>
          </div>
          <p className="lp-src">Manba: Prezident qarori PQ-294, 14.08.2026 (lex.uz); gazeta.uz, 17.08.2026. Bu yuridik maslahat emas — aniq holatingizni buxgalter yoki yurist bilan tekshiring.</p>
        </div>
      </section>

      {/* NEGA SAVORA — BNPL komissiyasi bilan taqqoslash */}
      <section className="lp-sec" id="nega-savora">
        <div className="lp-wrap">
          <div className="lp-head lp-reveal">
            <span className="lp-eyebrow">Nega Savora</span>
            <h2>Nasiyani o&apos;zingiz yuriting — komissiyani emas, foydani oling</h2>
            <p>Misol: {fmtPlanPrice(EX_PRICE)}lik telefon, 12 oyga. Uch xil yo&apos;l bilan do&apos;konga nima qoladi.</p>
          </div>
          <div className="lp-why">
            <div className="lp-why-c lp-reveal">
              <span className="lp-why-k">Daftar / Excel</span>
              <b className="lp-why-v">0 so&apos;m</b>
              <span className="lp-why-s">dastur xarajati</span>
              <ul>
                <li>Kim, qachon, qancha to&apos;lashi esdan chiqadi</li>
                <li>Kechikish faqat oy oxirida bilinadi</li>
                <li>Daftar yo&apos;qolsa — qarz ham yo&apos;qoladi</li>
              </ul>
            </div>
            <div className="lp-why-c lp-reveal">
              <span className="lp-why-k">Hamkor BNPL orqali</span>
              <b className="lp-why-v lp-why-v--neg">−{fmtPlanPrice(bnplFee)}</b>
              <span className="lp-why-s">do&apos;kon komissiyasi, ≈{Math.round(EX_BNPL_FEE * 100)}% (12 oy)</span>
              <ul>
                <li>Pul darhol tushadi, xavf hamkorda</li>
                <li>Har sotuvdan komissiya — muddat uzaygan sari oshadi</li>
                <li>Mijoz hamkorning mijoziga aylanadi</li>
              </ul>
            </div>
            <div className="lp-why-c lp-why-c--sv lp-reveal">
              <span className="lp-why-k">O&apos;z nasiyangiz + Savora</span>
              <b className="lp-why-v">{fmtPlanPrice(proPrice)}</b>
              <span className="lp-why-s">oyiga — barcha sotuvlar uchun, savdodan foiz yo&apos;q</span>
              <ul>
                <li>Narx va ustama sizniki (2027 chegarasi ichida)</li>
                <li>Jadval, eslatma va kechikish nazorati avtomatik</li>
                <li>Mijoz sizda qoladi va qayta keladi</li>
              </ul>
            </div>
          </div>
          <p className="lp-src">BNPL komissiyalari taxminiy: ochiq manbalardagi Alif Nasiya do&apos;kon tariflari (3 oy ≈10%, 6 oy ≈18%, 12 oy ≈30%; alphacon.uz), hamkor va kelishuvga qarab farq qiladi. O&apos;z nasiyangizda kechikish xavfi va muzlagan aylanma mablag&apos; do&apos;konda qoladi — Savora aynan shuni nazorat qilishga yordam beradi. Narx — Pro tarifi.</p>
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
              <p>Nasiya narxi, boshlang&apos;ich to&apos;lov, oylik jadval, qisman va muddatidan oldin to&apos;lov. Har oy holati bir qarashda ko&apos;rinadi.</p>
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

      {/* SOHALAR */}
      <section className="lp-sec lp-sec--alt" id="sohalar">
        <div className="lp-wrap">
          <div className="lp-head lp-reveal">
            <span className="lp-eyebrow">{sectorCards.length} ta yo&apos;nalish</span>
            <h2>Sohangizga moslab boshlanadi</h2>
            <p>Biznes turini tanlaysiz — menyu, atamalar va modullar o&apos;sha soha uchun sozlanadi. Ortiqcha bo&apos;limlar yo&apos;q.</p>
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
            <span className="lp-eyebrow">Yangi · AI yordamchi</span>
            <h2>Raqamlarni so&apos;rang — javob va topshiriq oling</h2>
            <p>AI yordamchi do&apos;koningiz ma&apos;lumotlari bo&apos;yicha oddiy tilda javob beradi va kerakli ishni topshiriqqa aylantiradi. Har kim faqat o&apos;z huquqi doirasini ko&apos;radi.</p>
          </div>
          <div className="lp-ai">
            {AI_ROLES.map((r) => (
              <div key={r.who} className="lp-ai-c lp-reveal">
                <span className="ic"><Svg>{r.ic}</Svg></span>
                <span className="lp-ai-who">{r.who}</span>
                <p className="lp-ai-q">{r.q}</p>
                <p>{r.d}</p>
              </div>
            ))}
          </div>
          <p className="lp-src">Modul bosqichma-bosqich ishga tushirilmoqda; tarifingizda yoqilganda menyuda paydo bo&apos;ladi.</p>
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
                <div className="lp-plan-price">{p.price}{p.price !== 'Bepul' && <span> / oy</span>}</div>
                <ul>{p.feats.map((ft) => <li key={ft}><Svg size={16}>{P.check}</Svg>{ft}</li>)}</ul>
                <Link href={LOCALHOST_LINKS.register} className={`lp-btn ${p.featured ? 'lp-btn--w' : 'lp-btn--f'}`}>Bepul sinash</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Faq trialDays={TRIAL_DAYS} limits={limits} />

      {/* CTA */}
      <section className="lp-sec">
        <div className="lp-wrap">
          <div className="lp-ctab lp-reveal">
            <svg className="lp-girih" viewBox="0 0 600 600" aria-hidden="true"><defs><pattern id="lp-cta-p" width="75" height="75" patternUnits="userSpaceOnUse"><g fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="17.5" y="17.5" width="40" height="40" /><rect x="17.5" y="17.5" width="40" height="40" transform="rotate(45 37.5 37.5)" /><circle cx="37.5" cy="37.5" r="9" /></g></pattern></defs><rect width="600" height="600" fill="url(#lp-cta-p)" /></svg>
            <h2>Nasiyani nazorat qiling, pulni vaqtida oling</h2>
            <p>{TRIAL_DAYS} kun barcha imkoniyatlar bepul. Ma&apos;lumotlaringizni ko&apos;chirishda yordam beramiz.</p>
            <div className="lp-ctab-row"><Link href={LOCALHOST_LINKS.register} className="lp-btn lp-btn--w lp-btn--lg">Ro&apos;yxatdan o&apos;tish</Link><Link href="/contact" className="lp-btn lp-btn--ghost lp-btn--lg">Demo so&apos;rash</Link></div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-foot">
        <div className="lp-wrap">
          <div className="lp-foot-grid">
            <div>
              <Link href="/" className="lp-brand"><BrandMark size={32} />Savora</Link>
              <p style={{ color: 'var(--lp-ink2)', maxWidth: 300, marginTop: 12 }}>Do&apos;konlar uchun savdo, ombor va nasiya nazorati platformasi.</p>
            </div>
            <div><h4>Mahsulot</h4><a href="#imkoniyatlar">Imkoniyatlar</a><a href="#tariflar">Tariflar</a><a href="#sohalar">Sohalar</a><a href="#qoidalar-2027">2027 qoidalari</a><Link href={LOCALHOST_LINKS.register}>Bepul sinov</Link></div>
            <div><h4>Kompaniya</h4><Link href="/contact">Bog&apos;lanish</Link><Link href="/help">Yordam markazi</Link></div>
            <div><h4>Hujjatlar</h4><Link href="/terms">Ommaviy oferta</Link><Link href="/privacy">Maxfiylik siyosati</Link></div>
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
