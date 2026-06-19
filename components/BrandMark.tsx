/** Savora belgisi — sodda ikki tonli chevron (qutisiz) */
export default function BrandMark({ size = 28 }: { size?: number }) {
  const strokeWidth = Math.max(1.2, size * 0.13);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M16 48 L32 18" stroke="var(--ink-1)" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M32 18 L48 48" stroke="var(--brand)" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
