'use client';

import { useRouter } from 'next/navigation';

/**
 * Davr tanlagichidagi «aniq kun» tugmasi: brauzer kalendari ko'rinmas input orqali ochiladi,
 * tanlangan kun `?p=YYYY-MM-DD` bo'lib URL'ga yoziladi (server o'sha kun ma'lumotini ko'rsatadi).
 */
export default function PeriodDayPick({ basePath, value, label, aria, max }: {
  basePath: string;
  /** Tanlangan kun (YYYY-MM-DD) yoki '' — kun tanlanmagan */
  value: string;
  /** Tanlangan kun yorlig'i ("10-noyabr") */
  label: string;
  aria: string;
  /** Bugungi sana — kelajak kunlar tanlanmaydi */
  max: string;
}) {
  const router = useRouter();
  const sep = basePath.includes('?') ? '&' : '?';
  const on = value !== '';
  return (
    <label className={`t-period-day${on ? ' is-on' : ''}`} title={aria}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
      {on && <span>{label}</span>}
      <span className="sr-only">{aria}</span>
      <input
        key={value}
        type="date"
        defaultValue={value}
        max={max}
        onClick={(e) => {
          try { e.currentTarget.showPicker?.(); } catch { /* qo'llamasa — brauzerning o'zi ochadi */ }
        }}
        onChange={(e) => {
          const v = e.currentTarget.value;
          // Klaviaturada yil yozilayotganda oraliq qiymatlar ("0002-…") bilan sakramaslik uchun
          if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v >= '2000-01-01' && v <= max && v !== value) {
            router.push(`${basePath}${sep}p=${v}`, { scroll: false });
          }
        }}
      />
    </label>
  );
}
