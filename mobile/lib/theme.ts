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

/** Raqamni "1 000" ko'rinishida formatlaydi (birliksiz). */
export function fmtSum(n: number): string {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(n || 0)).replace(/,/g, ' ');
}
