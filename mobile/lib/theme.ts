export const colors = {
  brand: '#4F46E5',
  brand2: '#7C3AED',
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  text: '#0F172A',
  textMuted: '#64748B',
  textFaint: '#94A3B8',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
};

/** Jonli (B) dizayn — rangli KPI plitkalari va amal chiplari uchun. */
export const tiles = {
  indigo: { bg: '#EEF2FF', fg: '#4F46E5' },
  green: { bg: '#ECFDF5', fg: '#059669' },
  red: { bg: '#FEF2F2', fg: '#DC2626' },
  amber: { bg: '#FFFBEB', fg: '#D97706' },
  slate: { bg: '#F1F5F9', fg: '#475569' },
} as const;

/** Raqamni "1 000 000" ko'rinishida — muhitdan mustaqil (Intl'siz). */
export function fmtSum(n: number): string {
  return Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Sana: DD.MM.YYYY */
export function fmtDate(d?: string | Date | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(dt.getDate())}.${p(dt.getMonth() + 1)}.${dt.getFullYear()}`;
}
