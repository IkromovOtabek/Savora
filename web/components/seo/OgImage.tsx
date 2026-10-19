import { LOGO, LOGO_RATIO, LOGO_VIEWBOX, LOGO_COLORS, WORDMARK } from '@/lib/brand';

/**
 * Satori (next/og) uchun logo — CSS o'zgaruvchilarsiz, qat'iy ranglar (Tun varianti).
 * Shakl lib/brand.ts dan; ilova ichidagi logo — components/BrandMark.tsx.
 */
export function StaticLogo({ height, mono = false }: { height: number; mono?: boolean }) {
  const c = mono ? LOGO_COLORS.mono : LOGO_COLORS.color;
  return (
    <svg width={Math.round(height * LOGO_RATIO)} height={height} viewBox={LOGO_VIEWBOX}>
      <defs>
        <linearGradient id="la" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stopColor={c.a[0]} /><stop offset=".55" stopColor={c.a[1]} /><stop offset="1" stopColor={c.a[2]} /></linearGradient>
        <linearGradient id="lb" x1=".15" y1="0" x2=".55" y2="1"><stop offset="0" stopColor={c.b[0]} /><stop offset=".5" stopColor={c.b[1]} /><stop offset="1" stopColor={c.b[2]} /></linearGradient>
        <linearGradient id="lr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c.bars[0]} /><stop offset="1" stopColor={c.bars[1]} /></linearGradient>
      </defs>
      <path d={LOGO.a} fill="url(#la)" />
      <path d={LOGO.b} fill="url(#lb)" />
      {LOGO.bars.map((d) => <path key={d} d={d} fill="url(#lr)" />)}
    </svg>
  );
}

/** Ilova ikonkasi foni (Tun varianti) */
export const TILE_BG = 'linear-gradient(160deg, #13254d 0%, #0a1530 100%)';

/**
 * Ijtimoiy tarmoqlar ulashish rasmi (OG/Twitter) — 1200x630 uchun JSX (next/og Satori).
 * Brend: tungi ko'k fon + ko'k gradient logo + Montserrat "Savora" konturi.
 * Satori cheklovi: faqat flex layout, ko'p bolali har bir div'da display:flex.
 */
export function BrandOgImage() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        background: 'radial-gradient(120% 90% at 20% 10%, #13254d 0%, #0b1530 55%, #070d1d 100%)',
        color: '#fff',
        fontFamily: 'sans-serif',
        position: 'relative',
      }}
    >
      {/* Fon bezagi — katta, xira logo */}
      <div style={{ position: 'absolute', right: 40, bottom: -60, display: 'flex', opacity: 0.1 }}>
        <StaticLogo height={560} mono />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <StaticLogo height={92} />
        <svg width={Math.round((56 * WORDMARK.width) / WORDMARK.height)} height={56} viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`}>
          {WORDMARK.letters.map((l) => <path key={l.x} d={l.d} fill="#fff" />)}
        </svg>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 900 }}>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 }}>
          Nasiyani nazorat qiling, pulni vaqtida oling
        </div>
        <div style={{ marginTop: 28, fontSize: 32, color: 'rgba(255,255,255,0.82)', lineHeight: 1.35 }}>
          Ombor, kassa, nasiya va shartnoma — bitta tizimda
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 28 }}>
        <div style={{ width: 14, height: 14, borderRadius: 7, background: '#2cc3ff' }} />
        <div style={{ color: 'rgba(255,255,255,0.9)' }}>savora.uz</div>
      </div>
    </div>
  );
}
