import Link from 'next/link';
import { getI18n } from '@/lib/i18n/server';
import { MONTHS, tr } from '@/lib/i18n/fmt';
import type { Locale } from '@/lib/i18n/config';

/** "2026-10" → "oktabr, 2026" / "октябрь, 2026" (brauzer tiliga bog'liq emas) */
export function monthLabel(ym: string, locale: Locale = 'uz'): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[locale][(m || 1) - 1]}, ${y}`;
}

function shift(ym: string, d: number): string {
  const [y, m] = ym.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + d, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Oy navigatsiyasi: ‹ oktabr, 2026 › — brauzerning o'z oy tanlagichi o'rniga.
 * href(ym) — shu oy uchun manzil (boshqa query parametrlarini sahifa o'zi qo'shadi).
 */
export default async function MonthNav({ value, current, href }: { value: string; current: string; href: (ym: string) => string }) {
  const { locale, d } = await getI18n();
  const prev = shift(value, -1);
  const next = shift(value, 1);
  const isFuture = next > current;
  return (
    <nav className="ux-month" aria-label={d.sales.monthNav.aria}>
      <Link href={href(prev)} aria-label={tr(d.sales.monthNav.prev, { m: monthLabel(prev, locale) })}>‹</Link>
      <span className="ux-month-cur" aria-current="date">{monthLabel(value, locale)}</span>
      <Link href={href(next)} aria-label={tr(d.sales.monthNav.next, { m: monthLabel(next, locale) })} aria-disabled={isFuture ? 'true' : undefined} tabIndex={isFuture ? -1 : undefined}>›</Link>
      {value !== current && <Link href={href(current)}>{d.common.thisMonth}</Link>}
    </nav>
  );
}
