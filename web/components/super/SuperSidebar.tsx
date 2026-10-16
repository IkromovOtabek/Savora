'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon, { type IconName } from '@/components/icons/Icon';
import BrandMark from '@/components/BrandMark';
import LogoutButton from '@/components/LogoutButton';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

export interface SuperNavItem {
  href: string;
  label: string;
  icon: IconName;
}

/** Super admin menyusi — iPadOS sidebar guruhlari */
export const SUPER_NAV_GROUPS: { title: string; items: SuperNavItem[] }[] = [
  {
    title: 'Boshqaruv',
    items: [
      { href: '/super/dashboard', label: 'Asosiy panel', icon: 'home' },
      { href: '/super', label: "Do'konlar", icon: 'building' },
      { href: '/super/payments', label: "To'lovlar", icon: 'wallet' },
    ],
  },
  {
    title: 'Platforma',
    items: [
      { href: '/super/plans', label: 'Tariflar', icon: 'plans' },
      { href: '/super/systems', label: 'Tizimlar', icon: 'settings' },
      { href: '/super/monitoring', label: 'Monitoring', icon: 'shield' },
      { href: '/super/metrics', label: 'Metrikalar', icon: 'trendingUp' },
      { href: '/super/visitors', label: 'Tashriflar', icon: 'chart' },
    ],
  },
];

/** Asosiy menyu — faqat bitta element active */
export function isSuperNavActive(href: string, pathname: string): boolean {
  if (href === '/super') {
    return pathname === '/super' || pathname.startsWith('/super/organizations');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SuperSidebar({
  pendingPayments = 0,
  orgCount,
  onNavigate,
}: {
  pendingPayments?: number;
  orgCount?: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const d = useDict();
  const s = d.superPanel;

  return (
    <aside className="sa-side" id="sa-sidebar" aria-label={s.shell.sidebarAria}>
      <Link href="/super/dashboard" className="sa-side-brand" onClick={onNavigate}>
        <BrandMark size={32} />
        <span>
          <b>{d.common.brand}</b>
          <small>{s.shell.superAdmin}</small>
        </span>
      </Link>

      {SUPER_NAV_GROUPS.map((g) => (
        <nav key={g.title} className="sa-side-group" aria-label={s.navGroups[g.title] ?? g.title}>
          <h5>{s.navGroups[g.title] ?? g.title}</h5>
          {g.items.map((item) => {
            const active = isSuperNavActive(item.href, pathname);
            const count =
              item.href === '/super/payments' && pendingPayments > 0 ? (
                <span className="sa-side-count sa-side-count--hot" aria-label={tr(s.shell.pendingPaymentsAria, { n: pendingPayments })}>{pendingPayments}</span>
              ) : item.href === '/super' && orgCount !== undefined ? (
                <span className="sa-side-count">{orgCount}</span>
              ) : null;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="sa-side-link"
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
              >
                <Icon name={item.icon} size={18} />
                {s.nav[item.href] ?? item.label}
                {count}
              </Link>
            );
          })}
        </nav>
      ))}

      <div className="sa-side-foot">
        <div className="sa-side-role">
          {s.shell.platformOwner}
          <small>{s.shell.superAdmin}</small>
        </div>
        <LogoutButton iconOnly />
      </div>
    </aside>
  );
}
