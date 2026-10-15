'use client';

import { useEffect, useRef, useState } from 'react';

/** Hero'dagi almashinuvchi so'z — har 2.4 soniyada pastdan yuqoriga siljiydi */
const WORDS = ['Nasiyani', 'Omborni', 'Kassani', 'Qarzlarni', 'Filiallarni'];

export function RotatingWord() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((v) => (v + 1) % WORDS.length), 2400);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="lp-rot" aria-live="polite">
      {/* Eng uzun so'z kenglikni ushlab turadi — matn sakramaydi */}
      <span className="lp-rot-sizer" aria-hidden="true">Filiallarni</span>
      {WORDS.map((w, k) => (
        <span key={w} className={`lp-rot-word${k === i ? ' is-on' : ''}${k === (i + WORDS.length - 1) % WORDS.length ? ' is-out' : ''}`} aria-hidden={k !== i}>
          {w}
        </span>
      ))}
    </span>
  );
}

const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

type Feed = { who: string; ini: string; what: string; amount: number; kind: 'naqd' | 'nasiya' | 'tolov' | 'bank' };
const FEED: Feed[] = [
  { who: 'Aziz Karimov', ini: 'AK', what: 'iPhone 15 · nasiya 6 oy', amount: 11200000, kind: 'nasiya' },
  { who: 'Dilnoza Yusupova', ini: 'DY', what: 'AirPods Pro 2 · naqd', amount: 2950000, kind: 'naqd' },
  { who: 'Nodira Alimova', ini: 'NA', what: 'To\'lov · 3/6-oy', amount: 1450000, kind: 'tolov' },
  { who: 'Sardor Rahimov', ini: 'SR', what: 'Artel muzlatgich · bank', amount: 6800000, kind: 'bank' },
  { who: 'Jasur Ergashev', ini: 'JE', what: 'Zaryadka 20W ×2 · naqd', amount: 378000, kind: 'naqd' },
  { who: 'Laylo Sobirova', ini: 'LS', what: 'Redmi 13C · nasiya 3 oy', amount: 1920000, kind: 'nasiya' },
];
const KIND: Record<Feed['kind'], { t: string; cls: string }> = {
  naqd: { t: 'Naqd', cls: 'ok' },
  nasiya: { t: 'Nasiya', cls: 'au' },
  tolov: { t: 'To\'lov', cls: 'br' },
  bank: { t: 'Bank', cls: 'mut' },
};
const TOASTS = [
  { t: 'AI tavsiya tayyor', s: '3 ta topshiriq · direktor uchun', ic: 'sign' },
  { t: 'Eslatma yuborildi', s: 'Umid X. · ertaga to\'lov kuni', ic: 'msg' },
  { t: 'To\'lov qabul qilindi', s: '+1 450 000 so\'m · Click', ic: 'ok' },
  { t: 'Kam qoldi: Zaryadka 20W', s: 'Omborda 3 dona', ic: 'box' },
];

function ToastIcon({ k }: { k: string }) {
  const p: Record<string, React.ReactNode> = {
    sign: <path d="M3 17c3-4 5-8 7-8s-1 8 2 8 3-5 5-5 2 3 4 3M3 21h18" />,
    msg: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z" />,
    ok: <path d="M20 6 9 17l-5-5" />,
    box: <><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p[k]}</svg>
  );
}

/** Samarqand girih naqshi — 8 qirrali yulduzlar to'ri (SVG pattern) */
function Girih() {
  return (
    <svg className="lp-girih" viewBox="0 0 600 600" aria-hidden="true">
      <defs>
        <pattern id="lp-girih-p" width="75" height="75" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1.1">
            <rect x="17.5" y="17.5" width="40" height="40" />
            <rect x="17.5" y="17.5" width="40" height="40" transform="rotate(45 37.5 37.5)" />
            <circle cx="37.5" cy="37.5" r="9" />
            <path d="M0 37.5h9M66 37.5h9M37.5 0v9M37.5 66v9" />
          </g>
        </pattern>
        <radialGradient id="lp-girih-m" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="lp-girih-mask"><rect width="600" height="600" fill="url(#lp-girih-m)" /></mask>
      </defs>
      <rect width="600" height="600" fill="url(#lp-girih-p)" mask="url(#lp-girih-mask)" />
    </svg>
  );
}

/** Jonli telefon sahnasi: sotuvlar oqimi, o'sib boruvchi tushum, chiquvchi bildirishnomalar */
export function HeroStage() {
  const [tick, setTick] = useState(0);
  const [total, setTotal] = useState(21_840_000);
  const [shown, setShown] = useState(21_840_000);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReduced(rm);
    if (rm) return;
    const t = setInterval(() => setTick((v) => v + 1), 2600);
    return () => clearInterval(t);
  }, []);

  // Har yangi sotuvda tushum oshadi
  useEffect(() => {
    if (tick === 0) return;
    const f = FEED[(tick - 1) % FEED.length];
    setTotal((v) => v + f.amount);
  }, [tick]);

  // Raqamni silliq sanab chiqish
  useEffect(() => {
    if (reduced) { setShown(total); return; }
    // setInterval — fon tabda ham oxirigacha yetadi (rAF u yerda to'xtaydi)
    const from = shown;
    const start = Date.now();
    const dur = 900;
    const t = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / dur);
      setShown(from + (total - from) * (1 - Math.pow(1 - p, 3)));
      if (p >= 1) clearInterval(t);
    }, 30);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, reduced]);

  const rows = [0, 1, 2, 3].map((k) => FEED[(((tick - k) % FEED.length) + FEED.length) % FEED.length]);
  const toast = TOASTS[tick % TOASTS.length];
  const toast2 = TOASTS[(tick + 2) % TOASTS.length];
  const ring = 38 + ((tick * 9) % 55);

  return (
    <div className="lp-stage">
      <div className="lp-layer lp-l0"><Girih /></div>
      <div className="lp-aurora" aria-hidden="true"><i /><i /><i /></div>

      <div className="lp-layer lp-l2">
        <div className="lp-phone" role="img" aria-label="Savora mobil ilovasi: bugungi tushum va jonli sotuvlar">
          <div className="lp-phone-scr">
            <div className="lp-ph-status"><b>9:41</b><span className="lp-ph-island" /><span>5G</span></div>
            <div className="lp-ph-body">
              <div className="lp-ph-eyebrow">PAYSHANBA, 15-OKTABR</div>
              <div className="lp-ph-title">Mobi Market</div>
              <div className="lp-ph-hero">
                <span>Bugungi tushum</span>
                <b className="lp-num">{fmt(shown)}</b>
                <small>▲ 18% kechaga · {37 + tick} sotuv</small>
              </div>
              <div className="lp-ph-mini">
                <div>
                  <svg viewBox="0 0 36 36" width="38" height="38" aria-hidden="true">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="var(--lp-fill)" strokeWidth="5" />
                    <circle cx="18" cy="18" r="14" fill="none" stroke="var(--lp-au)" strokeWidth="5" strokeLinecap="round" strokeDasharray="88" strokeDashoffset={88 - (88 * ring) / 100} transform="rotate(-90 18 18)" className="lp-ring" />
                  </svg>
                  <span><small>Bugun undirildi</small><b className="lp-num">{ring}%</b></span>
                </div>
              </div>
              <div className="lp-ph-sec">Jonli sotuvlar</div>
              <div className="lp-ph-list">
                {rows.map((r, k) => (
                  <div key={`${tick}-${k}`} className={`lp-ph-row${k === 0 && tick > 0 ? ' is-new' : ''}`}>
                    <span className="lp-av">{r.ini}</span>
                    <span className="lp-ph-t"><b>{r.who}</b><small>{r.what}</small></span>
                    <span className="lp-ph-a"><b className="lp-num">{fmt(r.amount)}</b><i className={`lp-pill ${KIND[r.kind].cls}`}>{KIND[r.kind].t}</i></span>
                  </div>
                ))}
              </div>
            </div>
            <div className="lp-ph-tab"><i className="on" /><i /><i className="sell" /><i /><i /></div>
          </div>
        </div>
      </div>

      <div className="lp-layer lp-l3">
        <div key={`a${tick}`} className="lp-toast lp-toast-a">
          <span className="lp-toast-ic"><ToastIcon k={toast.ic} /></span>
          <span><b>{toast.t}</b><small>{toast.s}</small></span>
        </div>
        <div key={`b${tick}`} className="lp-toast lp-toast-b">
          <span className="lp-toast-ic au"><ToastIcon k={toast2.ic} /></span>
          <span><b>{toast2.t}</b><small>{toast2.s}</small></span>
        </div>
        <div className="lp-coin lp-coin-1" aria-hidden="true">so&apos;m</div>
        <div className="lp-coin lp-coin-2" aria-hidden="true">$</div>
      </div>
    </div>
  );
}

/** Raqamni ko'rinishga kelganda sanab chiqaradi */
export function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(to);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let t: ReturnType<typeof setInterval> | undefined;
    const io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return;
      io.disconnect();
      const start = Date.now();
      setV(0);
      t = setInterval(() => {
        const p = Math.min(1, (Date.now() - start) / 1200);
        setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p >= 1) clearInterval(t);
      }, 30);
    });
    io.observe(el);
    return () => { io.disconnect(); if (t) clearInterval(t); };
  }, [to]);
  return <span ref={ref} className="lp-num">{v}{suffix}</span>;
}
