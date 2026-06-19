'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/icons/Icon';
import BrandMark from '@/components/BrandMark';
import LogoutButton from '@/components/LogoutButton';
import { PLATFORM_SYSTEMS, SUPER_NAV } from '@/lib/platformSystems';

const MAIN_NAV_HREFS: string[] = SUPER_NAV.map((item) => item.href);

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

/**
 * Tizim funksiyalari — faqat asosiy menuda yo'q bo'lgan havolalar active bo'ladi.
 * Aks holda bir xil URL uchun ikkita tugma bir vaqtda yonadi.
 */
function isSystemNavActive(href: string, pathname: string): boolean {
  if (MAIN_NAV_HREFS.includes(href)) return false;
  if (href.startsWith('http')) return false;
  const base = href.split('#')[0];
  if (base === '/super/systems') {
    return pathname === '/super/systems' || pathname.startsWith('/super/systems/');
  }
  return pathname === base || pathname.startsWith(`${base}/`);
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

      <div className="super-side-section">
        <div className="super-side-section-title">
          <Icon name="settings" size={16} />
          Loyiha tizim funksiyalari
        </div>
        <nav className="super-side-systems" aria-label="Tizim funksiyalari">
          {PLATFORM_SYSTEMS.map((sys) => {
            const isExternal = sys.external || sys.href.startsWith('http');
            const active = !isExternal && isSystemNavActive(sys.href, pathname);
            const className = `super-side-system${active ? ' super-side-system--active' : ''}`;

            if (isExternal) {
              return (
                <a
                  key={sys.id}
                  href={sys.href}
                  className={className}
                  target="_blank"
                  rel="noreferrer"
                  title={sys.description}
                >
                  <Icon name={sys.icon} size={16} />
                  <span>{sys.label}</span>
                </a>
              );
            }

            return (
              <Link
                key={sys.id}
                href={sys.href}
                className={className}
                title={sys.description}
                aria-current={active ? 'page' : undefined}
              >
                <Icon name={sys.icon} size={16} />
                <span>{sys.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="super-side-foot">
        <LogoutButton />
      </div>
    </aside>
  );
}
