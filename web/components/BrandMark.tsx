import { useId } from 'react';

/**
 * Savora belgisi — kobalt kvadratda oy sayin o'sib boruvchi to'lov ustunlari
 * va ularni bog'lovchi oltin chiziq (nasiya bosqichma-bosqich yopiladi, biznes o'sadi).
 * Favicon va PWA ikonkasi: public/icon.svg, public/icon-512.svg — shu shakl.
 */
export function BrandGlyph({ size = 28, radius }: { size?: number; radius?: number }) {
  const id = useId().replace(/:/g, '');
  const r = radius ?? 24;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false" style={{ display: 'block', flex: 'none' }}>
      <defs>
        <linearGradient id={`bm-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a68c4" />
          <stop offset="1" stopColor="#173f8f" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx={r} fill={`url(#bm-${id})`} />
      <rect x="20" y="58" width="13" height="24" rx="6.5" fill="#fff" opacity=".55" />
      <rect x="40" y="45" width="13" height="37" rx="6.5" fill="#fff" opacity=".8" />
      <rect x="60" y="32" width="13" height="50" rx="6.5" fill="#fff" />
      <path d="M24 46C38 28 58 20 79 21" fill="none" stroke="#f0bf4c" strokeWidth="6.5" strokeLinecap="round" />
      <circle cx="79" cy="21" r="6.5" fill="#f0bf4c" />
    </svg>
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
        boxShadow: '0 2px 6px rgba(31, 79, 168, .35)',
      }}
    >
      <BrandGlyph size={size} radius={0} />
    </span>
  );
}
