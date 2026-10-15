'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Icon from '@/components/icons/Icon';
import ThemeToggle from '@/components/ThemeToggle';
import SuperSidebar, { SUPER_NAV_GROUPS, isSuperNavActive } from './SuperSidebar';

function toolbarTitle(pathname: string): string {
  if (pathname === '/super/organizations/new') return "Yangi do'kon";
  if (pathname.startsWith('/super/organizations/')) return "Do'kon";
  for (const g of SUPER_NAV_GROUPS) {
    for (const item of g.items) if (isSuperNavActive(item.href, pathname)) return item.label;
  }
  return 'Super Admin';
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
  const [open, setOpen] = useState(false);

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
      <button type="button" className="sa-scrim" aria-label="Menyuni yopish" tabIndex={-1} onClick={() => setOpen(false)} />

      <div className="sa-main">
        <header className="sa-toolbar">
          <button
            type="button"
            className="sa-icon-btn sa-toolbar-menu"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menyu"
            aria-expanded={open}
            aria-controls="sa-sidebar"
          >
            <Icon name="menu" size={18} />
          </button>
          <p className="sa-toolbar-title">{toolbarTitle(pathname)}</p>
          <span className="sa-toolbar-spacer" />
          {pathname !== '/super/organizations/new' && (
            <Link href="/super/organizations/new" className="sa-btn sa-btn--filled sa-btn--sm sa-toolbar-new">
              <Icon name="plus" size={15} strokeWidth={2.6} />
              <span>Yangi do&apos;kon</span>
            </Link>
          )}
          <ThemeToggle />
        </header>
        <div className="sa-body">{children}</div>
      </div>
    </div>
  );
}
