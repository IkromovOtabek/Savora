'use client';

import { useId, useState } from 'react';
import Icon, { IconName } from '@/components/icons/Icon';

interface Props {
  title: string;
  sub?: string;
  icon?: IconName;
  /** Ikonka kvadrati foni (CSS rang) */
  iconBg?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/** iOS uslubidagi yig'iladigan karta: rangli ikonka kvadrati, sarlavha, chevron */
export default function CollapsibleCard({ title, sub, icon, iconBg, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section className="sa-card sa-collapse">
      <button
        type="button"
        className="sa-collapse-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        {icon && (
          <span className="sa-sq sa-sq--lg" style={iconBg ? { background: iconBg } : { background: 'var(--brand)' }} aria-hidden="true">
            <Icon name={icon} size={19} strokeWidth={2.2} />
          </span>
        )}
        <span className="sa-collapse-text">
          <b>{title}</b>
          {sub && <small>{sub}</small>}
        </span>
        <span className={`sa-collapse-arrow${open ? ' sa-collapse-arrow--open' : ''}`} aria-hidden="true">
          <Icon name="chevron" size={18} strokeWidth={2.4} />
        </span>
      </button>
      {open && <div className="sa-collapse-body" id={bodyId}>{children}</div>}
    </section>
  );
}
