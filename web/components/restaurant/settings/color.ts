/** Brend rangi tanlanmaganda QR-menyu, ko'rinish va QR kartadagi rang (Savora ko'ki) */
export const DEFAULT_BRAND_COLOR = '#1A5FE0';

/** Rang ustidagi matn rangi: och rangda qora, to'q rangda oq (WCAG nisbiy yorqinlik bo'yicha) */
export function textOnColor(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  if (!Number.isFinite(n)) return '#ffffff';
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111111' : '#ffffff';
}
