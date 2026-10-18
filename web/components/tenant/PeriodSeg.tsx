import Link from 'next/link';
import { PERIOD_KEYS, type PeriodKey } from '@/lib/period';
import { getDict } from '@/lib/i18n/server';

/**
 * Davr tanlagich (havolalar) — ?p= parametri. Sahifaning sukut davri (defaultKey) parametrsiz;
 * basePath'da so'rov qatori bo'lsa, p= '&' bilan qo'shiladi.
 */
export default async function PeriodSeg({ basePath, current, defaultKey = 'today' }: { basePath: string; current: PeriodKey; defaultKey?: PeriodKey }) {
  const t = (await getDict()).shell.dash.period;
  const sep = basePath.includes('?') ? '&' : '?';
  return (
    <nav className="t-period-seg" aria-label={t.aria}>
      {PERIOD_KEYS.map((k) => (
        <Link key={k} href={k === defaultKey ? basePath : `${basePath}${sep}p=${k}`} scroll={false} aria-current={current === k ? 'page' : undefined}>
          {t[k]}
        </Link>
      ))}
    </nav>
  );
}
