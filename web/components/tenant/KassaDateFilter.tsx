'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons/Icon';
import { useI18n } from '@/lib/i18n/client';
import { MONTHS, MONTHS_GENITIVE, tr } from '@/lib/i18n/fmt';
import type { Locale } from '@/lib/i18n/config';
import '@/components/tenant/styles/finance.css';

/** YYYY-MM-DD ga `days` kun qo'shadi (UTC — server/client bir xil natija) */
function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "2026-10-16" → "16-oktabr, 2026" / "16 октября 2026" (brauzer tiliga bog'liq emas) */
function dayLabel(date: string, locale: Locale): string {
  const [y, m, d] = date.split('-');
  if (!y || !m || !d) return date;
  const mi = (Number(m) || 1) - 1;
  return locale === 'ru' ? `${Number(d)} ${MONTHS_GENITIVE.ru[mi]} ${y}` : `${Number(d)}-${MONTHS.uz[mi]}, ${y}`;
}

export default function KassaDateFilter({
  initialDate,
  basePath = '/app/kassa',
  today,
}: {
  initialDate: string;
  basePath?: string;
  /** Server hisoblagan bugungi sana (YYYY-MM-DD) — "Bugun"/"Kecha" pillari uchun */
  today?: string;
}) {
  const router = useRouter();
  const { locale, d } = useI18n();
  const todayStr = today ?? initialDate;
  const yesterday = shiftDay(todayStr, -1);
  const prev = shiftDay(initialDate, -1);
  const next = shiftDay(initialDate, 1);
  const canNext = today ? next <= today : true;
  const href = (d: string) => `${basePath}?date=${d}`;
  const isOther = initialDate !== todayStr && initialDate !== yesterday;

  return (
    <nav className="fn-datebar" aria-label={d.sales.kassa.dateAria}>
      <div className="fn-pills">
        <Link href={href(prev)} className="fn-pill" aria-label={d.sales.kassa.prevDay}>
          <Icon name="chevron" size={18} className="fn-l" />
        </Link>
        <Link
          href={href(yesterday)}
          className={`fn-pill${initialDate === yesterday ? ' fn-pill--on' : ''}`}
          aria-current={initialDate === yesterday ? 'date' : undefined}
        >
          {d.common.yesterday}
        </Link>
        <Link
          href={href(todayStr)}
          className={`fn-pill${initialDate === todayStr ? ' fn-pill--on' : ''}`}
          aria-current={initialDate === todayStr ? 'date' : undefined}
        >
          {d.common.today}
        </Link>
        {canNext ? (
          <Link href={href(next)} className="fn-pill" aria-label={d.sales.kassa.nextDay}>
            <Icon name="chevron" size={18} className="fn-r" />
          </Link>
        ) : (
          <span className="fn-pill" aria-hidden="true" style={{ opacity: 0.35 }}>
            <Icon name="chevron" size={18} className="fn-r" />
          </span>
        )}
      </div>

      {/* Ikkilamchi: istalgan sana. Ko'rinadigan matn — o'zbekcha; brauzer kalendari ustidagi ko'rinmas input orqali ochiladi */}
      <label className={`fn-datepick${isOther ? ' fn-datepick--on' : ''}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        <span className="fn-datepick-text">{dayLabel(initialDate, locale)}</span>
        <span className="sr-only">{tr(d.sales.kassa.otherDate, { date: dayLabel(initialDate, locale) })}</span>
        <input
          key={initialDate}
          type="date"
          defaultValue={initialDate}
          max={today}
          onClick={(e) => {
            // Chrome/Edge: input bosilganda kalendarni darhol ochish
            try { e.currentTarget.showPicker?.(); } catch { /* qo'llab-quvvatlanmasa — brauzerning o'zi ochadi */ }
          }}
          onChange={(e) => {
            const v = e.currentTarget.value;
            // klaviaturada yil yozilayotganda oraliq qiymatlar ("0002-…") bilan sakramaslik uchun
            if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v >= '2000-01-01' && v !== initialDate && (!today || v <= today)) router.push(href(v));
          }}
        />
      </label>
    </nav>
  );
}
