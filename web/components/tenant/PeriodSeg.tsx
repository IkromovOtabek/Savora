import Link from 'next/link';
import { PERIOD_KEYS, isDayPeriod, periodRange, toDayKey, type PeriodKey } from '@/lib/period';
import { getI18n } from '@/lib/i18n/server';
import { fmtDayMonth } from '@/lib/i18n/fmt';
import PeriodDayPick from './PeriodDayPick';

/**
 * Davr tanlagich (havolalar) — ?p= parametri: Hammasi · Kecha · Bugun · Hafta · Oy · Yil + aniq kun.
 * Sahifaning sukut davri (defaultKey) parametrsiz; basePath'da so'rov qatori bo'lsa, p= '&' bilan qo'shiladi.
 */
export default async function PeriodSeg({ basePath, current, defaultKey = 'today' }: { basePath: string; current: PeriodKey; defaultKey?: PeriodKey }) {
  const { locale, d } = await getI18n();
  const t = d.shell.dash.period;
  const sep = basePath.includes('?') ? '&' : '?';
  const day = isDayPeriod(current) ? current : '';
  const now = new Date();
  const dayStart = day ? periodRange(day).start : null;
  const dayLabel = dayStart
    ? `${fmtDayMonth(dayStart, locale)}${dayStart.getFullYear() !== now.getFullYear() ? `, ${dayStart.getFullYear()}` : ''}`
    : '';
  return (
    <nav className="t-period-seg" aria-label={t.aria}>
      {PERIOD_KEYS.map((k) => (
        <Link key={k} href={k === defaultKey ? basePath : `${basePath}${sep}p=${k}`} scroll={false} aria-current={current === k ? 'page' : undefined}>
          {t[k]}
        </Link>
      ))}
      <PeriodDayPick basePath={basePath} value={day} label={dayLabel} aria={t.pickDay} max={toDayKey(now)} />
    </nav>
  );
}
