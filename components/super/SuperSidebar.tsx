'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/icons/Icon';
import BrandMark from '@/components/BrandMark';
import LogoutButton from '@/components/LogoutButton';
import { SUPER_NAV } from '@/lib/platformSystems';

/** Asosiy menyu — faqat bitta element active */
function isMainNavActive(href: string, pathname: string): boolean {
  if (href === '/super') {
    return (
      pathname === '/super' ||
      (pathname.startsWith('/super/organizations/') && pathname !== '/super/organizations/new')
    );
  }
  if (href === '/super/organizations/new') {
    return pathname === '/super/organizations/new';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SuperSidebar() {
  const pathname = usePathname();

  return (
    <aside className="super-side">
      <Link href="/super" className="super-brand">
        <span className="brand-mark-wrap">
          <BrandMark size={28} />
        </span>
        <div>
          <div className="super-brand-name">Savora</div>
          <div className="super-brand-sub">Super Admin</div>
        </div>
      </Link>

      <nav className="super-side-nav" aria-label="Asosiy menyu">
        {SUPER_NAV.map((item) => {
          const active = isMainNavActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`super-side-link${active ? ' super-side-link--active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="super-side-foot">
        <LogoutButton iconOnly />
      </div>
    </aside>
  );
}
