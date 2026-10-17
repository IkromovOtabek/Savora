'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { fmtMoney } from '@/lib/format';
import { smoothPath, type DayPoint } from '@/lib/weekBuckets';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

const PL = 8;
const PR = 50;
const PT = 44;
const PB = 30;

/** O'qdagi qisqa yozuv: 1 200 000 → "1,2 mln", 350 000 → "350 ming" */
function short(n: number, u: { mln: string; thousand: string }): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace('.', ',').replace(',0', '')} ${u.mln}`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} ${u.thousand}`;
  return String(Math.round(n));
}

/** O'q uchun "chiroyli" yuqori chegara */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

/**
 * Haftalik tushum — silliq chiziq, chuqur gradient maydon (soya qatlami bilan) va nurlanuvchi nuqta.
 * SVG kengligi konteynerga teng (ResizeObserver) — mobilda ham yozuvlar haqiqiy o'lchamda.
 * Kursor/barmoq/klaviatura (← →) bilan kunlik qiymat.
 */
export default function WeekChart({ points }: { points: DayPoint[] }) {
  const gid = useId().replace(/:/g, '');
  const d = useDict();
  const u = d.shell.weekChart;
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(600);
  const [sel, setSel] = useState<number | null>(null);
  const last = points.length - 1;

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      const cw = Math.round(e.contentRect.width);
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length < 2) return null;

  const W = Math.max(280, w);
  const H = W < 480 ? 220 : 240;
  const max = niceMax(Math.max(...points.map((p) => p.total)));
  const x = (i: number) => PL + 10 + (i * (W - PL - PR - 20)) / last;
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / max);
  const base = H - PB;
  const pts = points.map((p, i) => [x(i), y(p.total)] as [number, number]);
  const line = smoothPath(pts);
  const area = `${line} L${x(last).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z`;
  const active = sel ?? last;
  const ap = points[active];
  const prev = active > 0 ? points[active - 1].total : 0;
  const delta = prev > 0 ? Math.round((ap.total / prev - 1) * 100) : null;
  const weekTotal = points.reduce((s, p) => s + p.total, 0);

  function pick(clientX: number) {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const vx = ((clientX - r.left) / r.width) * W;
    const i = Math.round(((vx - PL - 10) / (W - PL - PR - 20)) * last);
    setSel(Math.max(0, Math.min(last, i)));
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setSel(Math.max(0, active - 1)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setSel(Math.min(last, active + 1)); }
  }

  const tipW = delta !== null ? 132 : 104;
  const tipX = Math.min(Math.max(x(active) - tipW / 2, 2), W - tipW - 2);
  const ax = x(active);
  const ay = y(ap.total);

  return (
    <div className="t-chart" ref={boxRef}>
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        className="t-chart-svg"
        role="img"
        tabIndex={0}
        aria-label={tr(u.aria, { total: fmtMoney(weekTotal), day: ap.label, date: ap.date, sum: fmtMoney(ap.total) })}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setSel(null)}
        onKeyDown={onKey}
        onBlur={() => setSel(null)}
      >
        <defs>
          {/* Chuqur maydon: yuqorida to'q, pastda shaffof */}
          <linearGradient id={`ar${gid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--brand)" stopOpacity=".42" />
            <stop offset=".55" stopColor="var(--brand)" stopOpacity=".14" />
            <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
          {/* Chiziq rangi — chapdan o'ngga yorishadi */}
          <linearGradient id={`ln${gid}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--brand)" stopOpacity=".55" />
            <stop offset="1" stopColor="var(--brand)" />
          </linearGradient>
          <filter id={`sh${gid}`} x="-10%" y="-30%" width="120%" height="160%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <radialGradient id={`gl${gid}`}>
            <stop offset="0" stopColor="var(--brand)" stopOpacity=".55" />
            <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
          </radialGradient>
        </defs>
        {[0, max / 2, max].map((v, i) => (
          <g key={i}>
            <line x1={PL} x2={W - PR + 6} y1={y(v)} y2={y(v)} className="t-chart-grid" strokeDasharray={v ? '2 5' : undefined} />
            <text x={W - PR + 12} y={y(v) + 4} className="t-chart-ax">{short(v, u)}</text>
          </g>
        ))}
        {points.map((p, i) => (
          <text key={p.date} x={x(i)} y={H - 9} textAnchor="middle" className={`t-chart-ax${i === active ? ' is-on' : ''}`}>{p.label}</text>
        ))}
        {/* Soya qatlami — chiziq ostida pastga siljigan xira nusxa (chuqurlik hissi) */}
        <path d={line} transform="translate(0 10)" className="t-chart-depth" filter={`url(#sh${gid})`} />
        <path d={area} fill={`url(#ar${gid})`} />
        <path d={line} className="t-chart-line" stroke={`url(#ln${gid})`} />
        <line x1={ax} x2={ax} y1={PT - 6} y2={base} className="t-chart-cursor" />
        <ellipse cx={ax} cy={base} rx={14} ry={3.5} className="t-chart-floor" />
        <circle cx={ax} cy={ay} r={18} fill={`url(#gl${gid})`} className="t-chart-glow" />
        <circle cx={ax} cy={ay} r={6} className="t-chart-dot" />
        <circle cx={ax - 1.6} cy={ay - 1.8} r={1.8} className="t-chart-dot-hi" />
        <g transform={`translate(${tipX.toFixed(1)},6)`} className="t-chart-tip">
          <rect width={tipW} height={28} rx={9} />
          <text x={11} y={18.5} className="t-chart-tip-t">{ap.label} · {short(ap.total, u)}</text>
          {delta !== null && (
            <text x={tipW - 10} y={18.5} textAnchor="end" className={`t-chart-tip-d${delta >= 0 ? ' is-up' : ' is-down'}`}>
              {delta >= 0 ? '+' : ''}{delta}%
            </text>
          )}
        </g>
      </svg>
      <div className="t-chart-foot">
        <span><b className="t-num">{fmtMoney(ap.total)}</b> {d.common.sum} · {tr(d.shell.dash.nSales, { n: ap.count })} · {ap.date}</span>
      </div>
    </div>
  );
}
