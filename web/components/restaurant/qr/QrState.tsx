import type { ReactNode } from 'react';
import Icon, { type IconName } from '@/components/icons/Icon';
import './qr-menu.css';

/**
 * Mijoz QR-menyusining to'liq sahifali holati: QR topilmadi / eskirgan, modul o'chiq, rate-limit, xato.
 * Server va client komponentda ishlaydi (hook yo'q). Matnlar chaqiruvchidan keladi (lug'at).
 */
export default function QrState({
  icon = 'qr',
  title,
  text,
  action,
  tone = 'neutral',
}: {
  icon?: IconName;
  title: string;
  text: string;
  action?: ReactNode;
  tone?: 'neutral' | 'warn';
}) {
  return (
    <main className="qm-state" role={tone === 'warn' ? 'alert' : undefined}>
      <div className={`qm-state-icon${tone === 'warn' ? ' qm-state-icon--warn' : ''}`} aria-hidden>
        <Icon name={icon} size={30} />
      </div>
      <h1 className="qm-state-title">{title}</h1>
      <p className="qm-state-text">{text}</p>
      {action ? <div className="qm-state-action">{action}</div> : null}
    </main>
  );
}
