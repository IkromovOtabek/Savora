/** Savora belgisi — ilova ikonkasi: kobalt gradientli yumaloq kvadrat, ichida «S» */
export default function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.25),
        background: 'linear-gradient(180deg, #3a68c4, #1f4fa8)',
        color: '#fff',
        display: 'inline-grid',
        placeItems: 'center',
        flex: 'none',
        fontFamily: '"Unbounded", "Onest", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontWeight: 700,
        fontSize: Math.round(size * 0.46),
        lineHeight: 1,
        letterSpacing: '-.02em',
        boxShadow: '0 2px 6px rgba(31, 79, 168, .35)',
        userSelect: 'none',
      }}
    >
      S
    </span>
  );
}
