'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { LOGO, LOGO_ALL, LOGO_RATIO, LOGO_VIEWBOX, WORDMARK } from '@/lib/brand';
import './animated-logo.css';

/**
 * Animatsion logo ("Chiziq" shabloni, UrbanDrive uslubi) — 7 s uzluksiz sikl:
 * xira iz → kontur chiziladi → ichiga to'lqinli "suyuq" rang pastdan quyiladi →
 * "Savora" harflari o'ngdan chapga to'ladi → yaltiroq aks chayqaladi → rang to'kiladi → qaytadan.
 * To'lqin clipPath ichida — u yerda faqat SMIL ishlaydi (CSS/WAAPI transform qo'llanmaydi).
 * Sahifa ochilganda sikl to'la holatdan boshlanadi (bo'sh logo "miltillamaydi").
 */
const D = 7000;
const START = 0.42 * D;
const KT = '0;.10;.26;.42;.86;.95;1';
const KS = '0 0 1 1;.45 0 .55 1;.45 0 .55 1;.6 0 .4 1;.55 0 .25 1;0 0 1 1';
const IN = 'cubic-bezier(.55,0,.25,1)';
const OUT = 'cubic-bezier(.6,0,.4,1)';
const SOFT = 'cubic-bezier(.45,0,.55,1)';

const WAVE = (() => {
  let top = '';
  for (let x = -160; x <= 420; x += 10) top += ` L${x},${(7 * Math.sin((2 * Math.PI * x) / 80)).toFixed(2)}`;
  return { fill: `M-160,420${top} L420,420 Z`, crest: `M-160,0${top}` };
})();

function Wave({ still, ...rest }: { still: boolean } & React.SVGProps<SVGPathElement>) {
  if (still) return <path {...rest} transform="translate(0 -26)" />;
  return (
    <path {...rest} transform="translate(0 310)">
      <animateTransform attributeName="transform" type="translate" dur={`${D / 1000}s`} repeatCount="indefinite" calcMode="spline" keyTimes={KT} keySplines={KS} values="0 310;0 310;0 160;0 -26;0 -26;0 310;0 310" />
      <animateTransform attributeName="transform" type="rotate" additive="sum" dur={`${D / 1000}s`} repeatCount="indefinite" calcMode="spline" keyTimes={KT} keySplines={KS} values="-10 117 0;-10 117 0;7 117 0;-3 117 0;0 117 0;9 117 0;-10 117 0" />
      <animateTransform attributeName="transform" type="translate" additive="sum" values="0 0;-80 0" dur="1.3s" repeatCount="indefinite" />
    </path>
  );
}

function run(root: HTMLElement, logoSvg: SVGSVGElement | null) {
  const o: KeyframeAnimationOptions = { duration: D, iterations: Infinity };
  const anims: Animation[] = [];
  const add = (el: Element, k: Keyframe[], opt = o) => anims.push(el.animate(k, opt));

  root.querySelectorAll('.al-ol').forEach((el, i) => add(el, [
    { offset: 0, strokeDashoffset: '1', strokeOpacity: 0 },
    { offset: 0.02 + i * 0.012, strokeDashoffset: '1', strokeOpacity: 0.9, easing: IN },
    { offset: 0.15 + i * 0.012, strokeDashoffset: '0', strokeOpacity: 0.9 },
    { offset: 0.22, strokeDashoffset: '0', strokeOpacity: 0.9 },
    { offset: 0.34, strokeDashoffset: '0', strokeOpacity: 0 },
    { offset: 1, strokeDashoffset: '0', strokeOpacity: 0 },
  ]));
  root.querySelectorAll('.al-slosh').forEach((el) => add(el, [
    { offset: 0, opacity: 0, transform: 'translateY(-40px)' },
    { offset: 0.44, opacity: 0, transform: 'translateY(-40px)', easing: SOFT },
    { offset: 0.52, opacity: 1, transform: 'translateY(90px)', easing: SOFT },
    { offset: 0.6, opacity: 0, transform: 'translateY(230px)' },
    { offset: 0.63, opacity: 0, transform: 'translateY(230px)', easing: SOFT },
    { offset: 0.71, opacity: 0.8, transform: 'translateY(100px)', easing: SOFT },
    { offset: 0.79, opacity: 0, transform: 'translateY(-40px)' },
    { offset: 1, opacity: 0, transform: 'translateY(-40px)' },
  ]));
  root.querySelectorAll('.al-bar').forEach((el, i) => {
    const k = i * 0.02;
    const f: Keyframe[] = [[0, 1], [0.46, 1], [0.52, 0.82], [0.58, 1], [0.64, 0.85], [0.7, 1], [0.76, 0.86], [0.82, 1]]
      .map(([t, v]) => ({ offset: t ? t + k : 0, transform: `scaleY(${v})`, easing: 'ease-in-out' }));
    add(el, [...f, { offset: 1, transform: 'scaleY(1)' }]);
  });
  const letters = [...root.querySelectorAll('.al-fl')];
  letters.forEach((el, i) => {
    const k = letters.length - 1 - i;
    const s = 0.22 + k * 0.03;
    const d = 0.86 + k * 0.006;
    add(el, [
      { offset: 0, clipPath: 'inset(0 0 0 100%)' },
      { offset: s, clipPath: 'inset(0 0 0 100%)', easing: OUT },
      { offset: s + 0.07, clipPath: 'inset(0 0 0 0%)' },
      { offset: d, clipPath: 'inset(0% 0 0 0)', easing: IN },
      { offset: d + 0.06, clipPath: 'inset(100% 0 0 0)' },
      { offset: 1, clipPath: 'inset(100% 0 0 0)' },
    ]);
  });
  root.querySelectorAll('.al-shim').forEach((el) => add(el, [
    { offset: 0, transform: 'translateX(0)' },
    { offset: 0.5, transform: 'translateX(0)', easing: SOFT },
    { offset: 0.64, transform: `translateX(${WORDMARK.width + 1400}px)` },
    { offset: 1, transform: `translateX(${WORDMARK.width + 1400}px)` },
  ]));

  // WAAPI va SMIL (to'lqin) bir xil nuqtadan — to'la holatdan boshlanadi
  anims.forEach((a) => { a.currentTime = START; });
  logoSvg?.setCurrentTime(START / 1000);
  return () => anims.forEach((a) => a.cancel());
}

interface Props {
  /** logo balandligi, px */
  size?: number;
  /** ostida "Savora" nomi */
  wordmark?: boolean;
  className?: string;
}

export default function AnimatedLogo({ size = 96, wordmark = true, className }: Props) {
  const id = useId().replace(/:/g, '');
  const rootRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<SVGSVGElement>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setStill(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (still || !rootRef.current) return;
    return run(rootRef.current, logoRef.current);
  }, [still]);

  const stop = (v: string) => ({ stopColor: `var(${v})` });
  const fills = (
    <>
      <path d={LOGO.a} fill={`url(#${id}a)`} />
      <rect x="5" y="80" width="125" height="77" fill={`url(#${id}s)`} clipPath={`url(#${id}k)`} />
      <path d={LOGO.b} fill={`url(#${id}b)`} />
      {LOGO.bars.map((d) => <g key={d} className="al-bar"><path d={d} fill={`url(#${id}r)`} /></g>)}
    </>
  );
  const wmH = Math.round(size * 0.21);

  return (
    <div ref={rootRef} className={`al${still ? ' al--still' : ''}${className ? ` ${className}` : ''}`} style={{ gap: Math.round(size * 0.08) }}>
      <svg ref={logoRef} width={Math.round(size * LOGO_RATIO)} height={size} viewBox={LOGO_VIEWBOX} aria-hidden="true" focusable="false" className="al-mark">
        <defs>
          <linearGradient id={`${id}a`} x1="0" y1="0" x2=".35" y2="1">
            <stop offset="0" style={stop('--lg-a1')} /><stop offset=".55" style={stop('--lg-a2')} /><stop offset="1" style={stop('--lg-a3')} />
          </linearGradient>
          <linearGradient id={`${id}b`} x1=".15" y1="0" x2=".55" y2="1">
            <stop offset="0" style={stop('--lg-b1')} /><stop offset=".5" style={stop('--lg-b2')} /><stop offset="1" style={stop('--lg-b3')} />
          </linearGradient>
          <linearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={stop('--lg-r1')} /><stop offset="1" style={stop('--lg-r2')} />
          </linearGradient>
          <radialGradient id={`${id}s`} cx="92" cy="150" r="58" gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: 'var(--lg-shade)', stopOpacity: 0.7 }} />
            <stop offset="1" style={{ stopColor: 'var(--lg-shade)', stopOpacity: 0 }} />
          </radialGradient>
          <clipPath id={`${id}k`}><path d={LOGO.a} /></clipPath>
          <clipPath id={`${id}u`}>{LOGO_ALL.map((d) => <path key={d} d={d} />)}</clipPath>
          <clipPath id={`${id}w`}><Wave still={still} d={WAVE.fill} /></clipPath>
        </defs>
        <g className="al-ghost">{LOGO_ALL.map((d) => <path key={d} d={d} />)}</g>
        <g clipPath={`url(#${id}w)`}>{fills}</g>
        <g clipPath={`url(#${id}u)`}>
          <Wave still={still} d={WAVE.crest} fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={5} />
          <path className="al-slosh" d="M-30,30 Q117,-8 270,30 L270,52 Q117,16 -30,52 Z" fill="#fff" fillOpacity={0.32} />
        </g>
        {LOGO_ALL.map((d) => <path key={d} className="al-ol" pathLength={1} d={d} />)}
      </svg>
      {wordmark && (
        <svg height={wmH} width={Math.round((wmH * WORDMARK.width) / WORDMARK.height)} viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`} role="img" aria-label="Savora" className="al-wm">
          <defs>
            <clipPath id={`${id}c`}>{WORDMARK.letters.map((l) => <path key={l.x} d={l.d} />)}</clipPath>
            <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".75" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {WORDMARK.letters.map((l) => (
            <g key={l.x}><path className="al-gh" d={l.d} /><path className="al-fl" d={l.d} /></g>
          ))}
          <g clipPath={`url(#${id}c)`}><rect className="al-shim" x="-1300" y="0" width="1100" height={WORDMARK.height} fill={`url(#${id}g)`} /></g>
        </svg>
      )}
    </div>
  );
}
