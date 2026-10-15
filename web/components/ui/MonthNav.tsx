import Link from 'next/link';

const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

/** "2026-10" → "oktabr, 2026" (brauzer tiliga bog'liq emas — ruscha chiqmaydi) */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]}, ${y}`;
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
export default function MonthNav({ value, current, href }: { value: string; current: string; href: (ym: string) => string }) {
  const prev = shift(value, -1);
  const next = shift(value, 1);
  const isFuture = next > current;
  return (
    <nav className="ux-month" aria-label="Oy tanlash">
      <Link href={href(prev)} aria-label={`Oldingi oy: ${monthLabel(prev)}`}>‹</Link>
      <span className="ux-month-cur" aria-current="date">{monthLabel(value)}</span>
      <Link href={href(next)} aria-label={`Keyingi oy: ${monthLabel(next)}`} aria-disabled={isFuture ? 'true' : undefined} tabIndex={isFuture ? -1 : undefined}>›</Link>
      {value !== current && <Link href={href(current)}>Shu oy</Link>}
    </nav>
  );
}
