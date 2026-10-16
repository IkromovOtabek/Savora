'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Icon from '@/components/icons/Icon';
import ThemeToggle from '@/components/ThemeToggle';
import LangSwitch from '@/components/LangSwitch';
import { useDict, type Dict } from '@/lib/i18n/client';
import SuperSidebar, { SUPER_NAV_GROUPS, isSuperNavActive } from './SuperSidebar';

function toolbarTitle(pathname: string, d: Dict): string {
  const s = d.superPanel;
  if (pathname === '/super/organizations/new') return s.shell.newStore;
  if (pathname.startsWith('/super/organizations/')) return s.shell.store;
  for (const g of SUPER_NAV_GROUPS) {
    for (const item of g.items) if (isSuperNavActive(item.href, pathname)) return s.nav[item.href] ?? item.label;
  }
  return s.shell.superAdmin;
}

/** Super admin qobig'i: xira sidebar + toolbar (mobil — chiqib keladigan menyu) */
export default function SuperShell({
  pendingPayments,
  orgCount,
  children,
}: {
  pendingPayments: number;
  orgCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const d = useDict();
  const [open, setOpen] = useState(false);
  // Telefonda asosiy amal (Yangi do'kon) — ro'yxat sahifalarida pastki o'ng FAB
  const fabPage = pathname === '/super' || pathname === '/super/dashboard';

  // Sahifa almashganda mobil menyu yopiladi
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={`sa-shell${open ? ' sa-shell--open' : ''}`}>
      <SuperSidebar pendingPayments={pendingPayments} orgCount={orgCount} onNavigate={() => setOpen(false)} />
      <button type="button" className="sa-scrim" aria-label={d.common.closeMenu} tabIndex={-1} onClick={() => setOpen(false)} />

      <div className="sa-main">
        <header className="sa-toolbar">
          <button
            type="button"
            className="sa-icon-btn sa-toolbar-menu"
            onClick={() => setOpen((v) => !v)}
            aria-label={d.common.menu}
            aria-expanded={open}
            aria-controls="sa-sidebar"
          >
            <Icon name="menu" size={18} />
          </button>
          <p className="sa-toolbar-title">{toolbarTitle(pathname, d)}</p>
          <span className="sa-toolbar-spacer" />
          {pathname !== '/super/organizations/new' && (
            <Link href="/super/organizations/new" className={`sa-btn sa-btn--filled sa-btn--sm sa-toolbar-new${fabPage ? ' ux-hide-mobile' : ''}`} aria-label={d.superPanel.shell.newStore}>
              <Icon name="plus" size={15} strokeWidth={2.6} />
              <span>{d.superPanel.shell.newStore}</span>
            </Link>
          )}
          <LangSwitch compact />
          <ThemeToggle />
        </header>
        <div className={`sa-body${fabPage ? ' sa-body--fab' : ''}`}>{children}</div>
        {fabPage && (
          <Link href="/super/organizations/new" className="ux-fab">
            <Icon name="plus" size={18} strokeWidth={2.6} />
            {d.superPanel.shell.newStore}
          </Link>
        )}
      </div>
    </div>
  );
}
