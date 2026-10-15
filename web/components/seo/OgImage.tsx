/**
 * Ijtimoiy tarmoqlar ulashish rasmi (OG/Twitter) — 1200x630 uchun JSX (next/og Satori).
 * Samarqand brendi: kobalt gradient + BrandMark (o'sib boruvchi ustunlar + oltin chiziq).
 * Shakl components/BrandMark.tsx dagi viewBox 0 0 100 100 bilan bir xil.
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
        background: 'linear-gradient(135deg, #3a68c4 0%, #1f4fa8 45%, #0f2a66 100%)',
        color: '#fff',
        fontFamily: 'sans-serif',
        position: 'relative',
      }}
    >
      {/* Fon bezagi — katta, xira ustunlar */}
      <div style={{ position: 'absolute', right: 60, bottom: 0, display: 'flex', alignItems: 'flex-end', gap: 36, opacity: 0.12 }}>
        <div style={{ width: 90, height: 200, borderRadius: 45, background: '#fff' }} />
        <div style={{ width: 90, height: 320, borderRadius: 45, background: '#fff' }} />
        <div style={{ width: 90, height: 440, borderRadius: 45, background: '#fff' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <svg width="96" height="96" viewBox="0 0 100 100">
          <rect width="100" height="100" rx="24" fill="#173f8f" />
          <rect x="20" y="58" width="13" height="24" rx="6.5" fill="#fff" opacity="0.55" />
          <rect x="40" y="45" width="13" height="37" rx="6.5" fill="#fff" opacity="0.8" />
          <rect x="60" y="32" width="13" height="50" rx="6.5" fill="#fff" />
          <path d="M24 46C38 28 58 20 79 21" fill="none" stroke="#f0bf4c" strokeWidth="6.5" strokeLinecap="round" />
          <circle cx="79" cy="21" r="6.5" fill="#f0bf4c" />
        </svg>
        <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: -1 }}>Savora</div>
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
        <div style={{ width: 14, height: 14, borderRadius: 7, background: '#f0bf4c' }} />
        <div style={{ color: 'rgba(255,255,255,0.9)' }}>savora.uz</div>
      </div>
    </div>
  );
}
