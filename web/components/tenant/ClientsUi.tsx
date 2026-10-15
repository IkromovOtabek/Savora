// Mijozlar / Nasiya / Qarzdorlik / Daftar sahifalari uchun umumiy ko'rinish bo'laklari (server-safe).
import Link from 'next/link';
import Icon, { type IconName } from '@/components/icons/Icon';

const TONES = ['b', 'a', 'o', 'r', 'g'] as const;

/** Ismdan bosh harflar: "Nodira Alimova" → "NA" */
export function initials(name?: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Ism bo'yicha barqaror rang (har safar bir xil) */
function tone(name?: string): (typeof TONES)[number] {
  let h = 0;
  for (const ch of name ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export function Avatar({ name, photoUrl, size = 'md' }: { name?: string; photoUrl?: string; size?: 'md' | 'lg' }) {
  const cls = `cl-av cl-av--${tone(name)}${size === 'lg' ? ' cl-av--lg' : ''}`;
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" className={`${cls} cl-av--img`} />;
  }
  return <span className={cls} aria-hidden="true">{initials(name)}</span>;
}

export type PillTone = 'ok' | 'bad' | 'warn' | 'mut' | 'brand' | 'gold';

export function Pill({ tone: t, children }: { tone: PillTone; children: React.ReactNode }) {
  return <span className={`cl-pill cl-pill--${t}`}>{children}</span>;
}

/** Ingichka progress chiziq (0..1) */
export function Progress({ value, tone: t, label }: { value: number; tone?: 'ok' | 'bad' | 'gold'; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={`cl-prog${t ? ` cl-prog--${t}` : ''}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Aylana progress (0..1) — markazda foiz */
export function Ring({ value, size = 92, tone: t = 'gold' }: { value: number; size?: number; tone?: 'gold' | 'brand' | 'bad' | 'ok' }) {
  const v = Math.max(0, Math.min(1, value));
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <span className={`cl-ring cl-ring--${t}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="cl-ring-track" />
        <circle
          cx="50"
          cy="50"
          r={r}
          className="cl-ring-bar"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <b>{Math.round(v * 100)}%</b>
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: IconName;
  title: string;
  text?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="cl-empty">
      <span className="cl-empty-ic"><Icon name={icon} size={26} /></span>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action && <Link href={action.href} className="btn btn-primary">{action.label}</Link>}
    </div>
  );
}
