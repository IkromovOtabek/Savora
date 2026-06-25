'use client';

import { useState } from 'react';
import Icon, { IconName, IconBadge } from '@/components/icons/Icon';

interface Props {
  title: string;
  sub?: string;
  icon?: IconName;
  iconBg?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function CollapsibleCard({ title, sub, icon, iconBg, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="panel collapse-card">
      <button
        type="button"
        className="collapse-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="collapse-head-left">
          {icon && <IconBadge name={icon} bg={iconBg ?? 'var(--brand)'} className="icon-badge--sm" />}
          <span className="collapse-head-text">
            <span className="collapse-title">{title}</span>
            {sub && <span className="collapse-sub">{sub}</span>}
          </span>
        </span>
        <span className={`collapse-arrow${open ? ' collapse-arrow--open' : ''}`}>
          <Icon name="chevron" size={18} />
        </span>
      </button>
      {open && <div className="collapse-body">{children}</div>}
    </div>
  );
}
