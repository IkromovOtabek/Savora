import { useId } from 'react';
import { LOGO, LOGO_RATIO, LOGO_VIEWBOX, WORDMARK } from '@/lib/brand';

/**
 * Savora belgisi — buklangan lenta "S" va 3 o'sib boruvchi ustun (lib/brand.ts).
 * Ranglar mavzuga bog'liq (globals.css: --lg-*): Kun/Tun — ko'k gradient, Qora — oq.
 * Favicon/PWA: app/icon.svg, app/apple-icon.svg, public/icon-512.svg, app/icons/[file] — shu shakl.
 */
export function LogoSvg({ height = 28, className }: { height?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const stop = (v: string) => ({ stopColor: `var(${v})` });
  return (
    <svg
      className={className}
      width={Math.round(height * LOGO_RATIO * 10) / 10}
      height={height}
      viewBox={LOGO_VIEWBOX}
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flex: 'none', overflow: 'visible' }}
    >
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
      </defs>
      <path d={LOGO.a} fill={`url(#${id}a)`} />
      <rect x="5" y="80" width="125" height="77" fill={`url(#${id}s)`} clipPath={`url(#${id}k)`} />
      <path d={LOGO.b} fill={`url(#${id}b)`} />
      {LOGO.bars.map((d) => <path key={d} d={d} fill={`url(#${id}r)`} />)}
    </svg>
  );
}

/** Ilova ikonkasi: plitka (mavzu rangida) ichida logo */
export function BrandGlyph({ size = 28, radius }: { size?: number; radius?: number }) {
  const r = radius ?? 24;
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: `${r}%`,
        display: 'inline-grid',
        placeItems: 'center',
        flex: 'none',
        background: 'var(--logo-tile)',
      }}
    >
      <LogoSvg height={Math.round(size * 0.74)} />
    </span>
  );
}

export default function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.24),
        display: 'inline-grid',
        flex: 'none',
        overflow: 'hidden',
        boxShadow: 'var(--logo-tile-shadow)',
      }}
    >
      <BrandGlyph size={size} radius={0} />
    </span>
  );
}

/** "Savora" nomi — Montserrat Bold konturlari (shrift yuklanishiga bog'liq emas) */
export function Wordmark({ height = 20, className }: { height?: number; className?: string }) {
  return (
    <svg
      className={className}
      height={height}
      width={Math.round((height * WORDMARK.width) / WORDMARK.height)}
      viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`}
      role="img"
      aria-label="Savora"
      style={{ display: 'block', flex: 'none' }}
    >
      {WORDMARK.letters.map((l) => <path key={l.x} d={l.d} fill="currentColor" />)}
    </svg>
  );
}
