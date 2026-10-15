import Link from 'next/link';
import Icon, { type IconName } from '@/components/icons/Icon';
import './auth.css';

type Tone = 'error' | 'warn' | 'info' | 'ok';

const ALERT_ICON: Record<Tone, IconName> = { error: 'alert', warn: 'bell', info: 'bell', ok: 'check' };

/** Kirish/ro'yxat xabari (xato, ogohlantirish, ma'lumot) */
export function AuthAlert({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <div className={`au-alert au-alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={ALERT_ICON[tone]} size={17} />
      <div>{children}</div>
    </div>
  );
}

interface Props {
  title: string;
  subtitle?: React.ReactNode;
  wide?: boolean;
  /** Ilova ikonkasi o'rniga holat ikonkasi (masalan: qulf, soat) */
  icon?: IconName;
  iconTone?: 'danger' | 'warn' | 'brand';
  /** true — to'liq ekran o'rniga ilova ichida (tenant layout ichida) */
  inline?: boolean;
  /** Sarlavha ustidagi qo'shimcha (masalan: qadamlar) */
  top?: React.ReactNode;
  children: React.ReactNode;
}

/** iOS "sheet" uslubidagi markaziy karta: ilova ikonkasi + katta sarlavha */
export default function AuthShell({ title, subtitle, wide, icon, iconTone = 'brand', inline, top, children }: Props) {
  const card = (
    <div className={`au-card${wide ? ' au-card--wide' : ''}`}>
      <div className="au-head">
        {icon ? (
          <span className={`au-appicon au-appicon--${iconTone}`} aria-hidden="true">
            <Icon name={icon} size={28} />
          </span>
        ) : (
          <Link href="/" className="au-appicon" aria-label="Savora — bosh sahifa">S</Link>
        )}
        {top}
        <h1 className="au-title">{title}</h1>
        {subtitle && <p className="au-sub">{subtitle}</p>}
      </div>
      {children}
    </div>
  );

  if (inline) return <div className="au-inline">{card}</div>;
  return <main className="au-wrap">{card}</main>;
}
