import Link from 'next/link';
import { PERIOD_KEYS, type PeriodKey } from '@/lib/period';
import { getDict } from '@/lib/i18n/server';

/** Davr tanlagich (havolalar) — ?p= parametri; "Bugun" — sukut, parametrsiz */
export default async function PeriodSeg({ basePath, current }: { basePath: string; current: PeriodKey }) {
  const t = (await getDict()).shell.dash.period;
  return (
    <nav className="t-period-seg" aria-label={t.aria}>
      {PERIOD_KEYS.map((k) => (
        <Link key={k} href={k === 'today' ? basePath : `${basePath}?p=${k}`} scroll={false} aria-current={current === k ? 'page' : undefined}>
          {t[k]}
        </Link>
      ))}
    </nav>
  );
}
