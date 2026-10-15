'use client';

import { useId, useRef, useState } from 'react';
import { fmtMoney } from '@/lib/format';
import { smoothPath, type DayPoint } from '@/lib/weekBuckets';

const W = 600;
const H = 210;
const PL = 12;
const PR = 52;
const PT = 40;
const PB = 28;

/** O'qdagi qisqa yozuv: 1 200 000 → "1,2 mln", 350 000 → "350 ming" */
function short(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace('.', ',').replace(',0', '')} mln`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} ming`;
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

/** Haftalik tushum — silliq chiziq + gradient maydon, kursor/klaviatura bilan kunlik qiymat. */
export default function WeekChart({ points }: { points: DayPoint[] }) {
  const gid = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
  const last = points.length - 1;
  const [sel, setSel] = useState<number | null>(null);

  if (points.length < 2) return null;

  const max = niceMax(Math.max(...points.map((p) => p.total)));
  const x = (i: number) => PL + (i * (W - PL - PR)) / last;
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / max);
  const pts = points.map((p, i) => [x(i), y(p.total)] as [number, number]);
  const line = smoothPath(pts);
  const area = `${line} L${x(last).toFixed(1)},${H - PB} L${x(0).toFixed(1)},${H - PB} Z`;
  const active = sel ?? last;
  const ap = points[active];
  const prev = active > 0 ? points[active - 1].total : 0;
  const delta = prev > 0 ? Math.round((ap.total / prev - 1) * 100) : null;
  const weekTotal = points.reduce((s, p) => s + p.total, 0);

  function pick(clientX: number) {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const vx = ((clientX - r.left) / r.width) * W;
    const i = Math.round(((vx - PL) / (W - PL - PR)) * last);
    setSel(Math.max(0, Math.min(last, i)));
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setSel(Math.max(0, active - 1)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setSel(Math.min(last, active + 1)); }
  }

  const tipW = 150;
  const tipX = Math.min(Math.max(x(active) - tipW / 2, 2), W - tipW - 2);

  return (
    <div className="t-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="t-chart-svg"
        role="img"
        tabIndex={0}
        aria-label={`Oxirgi 7 kun tushumi: jami ${fmtMoney(weekTotal)} so'm. Tanlangan: ${ap.label} ${ap.date} — ${fmtMoney(ap.total)} so'm. Kunlarni o'q tugmalari bilan almashtiring.`}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setSel(null)}
        onKeyDown={onKey}
        onBlur={() => setSel(null)}
      >
        <defs>
          <linearGradient id={`ar${gid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--brand)" stopOpacity=".26" />
            <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, max / 2, max].map((v, i) => (
          <g key={i}>
            <line x1={PL} x2={W - PR + 6} y1={y(v)} y2={y(v)} className="t-chart-grid" strokeDasharray={v ? '2 4' : undefined} />
            <text x={W - PR + 10} y={y(v) + 4} className="t-chart-ax">{short(v)}</text>
          </g>
        ))}
        {points.map((p, i) => (
          <text key={p.date} x={x(i)} y={H - 8} textAnchor="middle" className={`t-chart-ax${i === active ? ' is-on' : ''}`}>{p.label}</text>
        ))}
        <path d={area} fill={`url(#ar${gid})`} />
        <path d={line} className="t-chart-line" />
        <line x1={x(active)} x2={x(active)} y1={PT - 4} y2={H - PB} className="t-chart-cursor" />
        <circle cx={x(active)} cy={y(ap.total)} r={9} className="t-chart-halo" />
        <circle cx={x(active)} cy={y(ap.total)} r={5} className="t-chart-dot" />
        <g transform={`translate(${tipX},4)`} className="t-chart-tip">
          <rect width={tipW} height={28} rx={8} />
          <text x={10} y={18} className="t-chart-tip-t">{ap.label} · {short(ap.total)}</text>
          {delta !== null && (
            <text x={tipW - 9} y={18} textAnchor="end" className={`t-chart-tip-d${delta >= 0 ? ' is-up' : ' is-down'}`}>
              {delta >= 0 ? '+' : ''}{delta}%
            </text>
          )}
        </g>
      </svg>
      <div className="t-chart-foot">
        <span><b className="t-num">{fmtMoney(ap.total)}</b> so&apos;m · {ap.count} ta sotuv · {ap.date}</span>
      </div>
    </div>
  );
}
