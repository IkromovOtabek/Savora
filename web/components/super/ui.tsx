import Link from 'next/link';
import Icon, { type IconName } from '@/components/icons/Icon';

/** Super admin uchun kichik UI bloklari (server va client'da ishlaydi) */

export type SqTone = 'b' | 'a' | 'o' | 'r' | 'v' | 'c' | 'g';
export type PillTone = 'ok' | 'bad' | 'warn' | 'br' | 'gold' | 'mut';

export function PageTitle({
  title,
  sub,
  back,
  actions,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <div className="sa-ltitle">
      <div style={{ minWidth: 0 }}>
        {back && (
          <Link href={back.href} className="sa-back">
            <Icon name="arrowLeft" size={17} /> {back.label}
          </Link>
        )}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="sa-ltitle-actions">{actions}</div>}
    </div>
  );
}

export function Sq({ icon, tone = 'b', size = 17 }: { icon: IconName; tone?: SqTone; size?: number }) {
  return (
    <span className={`sa-sq sa-sq--${tone}`} aria-hidden="true">
      <Icon name={icon} size={size} strokeWidth={2.2} />
    </span>
  );
}

export function Kpi({
  label,
  value,
  unit,
  icon,
  tone = 'b',
  delta,
  deltaTone,
  hero,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  icon: IconName;
  tone?: SqTone;
  delta?: React.ReactNode;
  deltaTone?: 'ok' | 'bad' | 'warn';
  hero?: boolean;
}) {
  return (
    <div className={`sa-card sa-kpi${hero ? ' sa-kpi--hero' : ''}`}>
      <div className="sa-kpi-l">
        <Sq icon={icon} tone={tone} size={15} />
        {label}
      </div>
      <div className="sa-kpi-v">
        {value}
        {unit && <small> {unit}</small>}
      </div>
      {delta && <div className={`sa-kpi-d${deltaTone ? ` sa-kpi-d--${deltaTone}` : ''}`}>{delta}</div>}
    </div>
  );
}

export function Pill({ tone = 'mut', children }: { tone?: PillTone; children: React.ReactNode }) {
  return <span className={`sa-pill${tone === 'mut' ? '' : ` sa-pill--${tone}`}`}>{children}</span>;
}

const ORG_STATUS_TONE: Record<'active' | 'expired' | 'suspended', PillTone> = {
  active: 'ok',
  expired: 'bad',
  suspended: 'warn',
};

export function OrgStatusPill({ status }: { status: { key: 'active' | 'expired' | 'suspended'; label: string } }) {
  return <Pill tone={ORG_STATUS_TONE[status.key]}>{status.label}</Pill>;
}

export function Chevron() {
  return (
    <span className="sa-chev" aria-hidden="true">
      <Icon name="chevron" size={14} strokeWidth={2.6} />
    </span>
  );
}

const AV_TONES = ['b', 'o', 'a', 'r'] as const;

/** Nomdan bosh harf + barqaror rang */
export function Avatar({ name }: { name: string }) {
  const letter = (name.trim()[0] ?? '?').toUpperCase();
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return <span className={`sa-av sa-av--${AV_TONES[h % AV_TONES.length]}`} aria-hidden="true">{letter}</span>;
}

export function Alert({ tone, children }: { tone: 'error' | 'warn' | 'info' | 'ok'; children: React.ReactNode }) {
  const icon: IconName = tone === 'error' ? 'alert' : tone === 'ok' ? 'check' : 'bell';
  return (
    <div className={`sa-alert sa-alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={icon} size={17} />
      <div>{children}</div>
    </div>
  );
}
