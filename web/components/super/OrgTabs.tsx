'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Icon, { type IconName } from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';

export interface OrgTab {
  id: string;
  label: string;
  icon: IconName;
  content: ReactNode;
}

/**
 * Do'kon sahifasi ichki bo'limlari (tablar). Yopishqoq segment, URL hash bilan sinxron (#modullar).
 * Barcha panellar DOM'da qoladi (`hidden`) — forma holati tab almashganda yo'qolmaydi.
 */
export default function OrgTabs({ tabs, defaultId }: { tabs: OrgTab[]; defaultId?: string }) {
  const [active, setActive] = useState(defaultId ?? tabs[0]?.id);
  const base = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const d = useDict();

  // Hash'dan boshlang'ich tab (#huquqlar) va orqaga/oldinga tugmalari
  useEffect(() => {
    const sync = () => {
      const h = window.location.hash.slice(1);
      if (h && tabs.some((t) => t.id === h)) setActive(h);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [tabs]);

  function select(id: string, focus = false) {
    setActive(id);
    history.replaceState(null, '', `#${id}`);
    const btn = listRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${id}"]`);
    btn?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (focus) btn?.focus();
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.id === active);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    select(tabs[next].id, true);
  }

  return (
    <div className="sa-tabs">
      <div className="sa-tabs-bar">
        <div className="sa-tabs-list ux-scrollx" role="tablist" aria-label={d.superPanel.org.tabsAria} ref={listRef} onKeyDown={onKey}>
          {tabs.map((t) => {
            const on = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`${base}-t-${t.id}`}
                data-tab={t.id}
                aria-selected={on}
                aria-controls={`${base}-p-${t.id}`}
                tabIndex={on ? 0 : -1}
                className="sa-tab"
                onClick={() => select(t.id)}
              >
                <Icon name={t.icon} size={15} strokeWidth={2.2} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-p-${t.id}`}
          aria-labelledby={`${base}-t-${t.id}`}
          hidden={t.id !== active}
          className="sa-tabpanel"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
