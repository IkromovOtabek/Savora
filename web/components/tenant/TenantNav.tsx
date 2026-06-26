'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FeatureKey, OrgFeatures } from '@/lib/features';
import Icon, { IconName } from '@/components/icons/Icon';

const NAV_ICONS: Record<string, IconName> = {
  '/app': 'home',
  '/app/sales': 'cart',
  '/app/debts': 'bell',
  '/app/kassa': 'wallet',
  '/app/products': 'box',
  '/app/inventory': 'clipboard',
  '/app/imei': 'search',
  '/app/monitoring': 'chart',
  '/app/users': 'user',
  '/app/profile': 'settings',
  '/app/kirim-chiqim': 'chart',
  '/app/kredit-kassa': 'wallet',
  '/app/customers': 'user',
  '/app/branches': 'building',
  '/app/transferred': 'repeat',
  '/app/audit': 'clipboard',
};

const LINKS: { href: string; label: string; feature?: FeatureKey; adminOnly?: boolean; branchOnly?: boolean; imeiOnly?: boolean; exact?: boolean }[] = [
  { href: '/app', label: 'Asosiy Sahifa', exact: true, branchOnly: true },
  { href: '/app/products', label: 'Ombor', feature: 'products' },
  { href: '/app/sales', label: 'Sotildi', feature: 'sales' },
  { href: '/app/transferred', label: 'Filialga berildi', feature: 'transferred' },
  { href: '/app/kassa', label: 'Naxt kassa', feature: 'kassa' },
  { href: '/app/kirim-chiqim', label: 'Kirim-Chiqim', feature: 'kirimChiqim', adminOnly: true },
  { href: '/app/kredit-kassa', label: 'Kredit kassa', feature: 'creditKassa', adminOnly: true },
  { href: '/app/inventory', label: 'Inventar', feature: 'inventory' },
  { href: '/app/imei', label: 'IMEI qidirish', imeiOnly: true },
  { href: '/app/monitoring', label: 'Hisobot', feature: 'monitoring' },
  { href: '/app/users', label: 'Filiallar', feature: 'users', adminOnly: true },
  { href: '/app/audit', label: 'Amallar', feature: 'audit', adminOnly: true },
  { href: '/app/debts', label: 'Qarzdorlik', feature: 'sales' },
  { href: '/app/profile', label: 'Kabinet' },
];

// Pastki tab bar — eng muhim havolalar tartibi (rolga qarab) + qisqa yorliqlar
const TAB_ORDER = ['/app', '/app/products', '/app/sales', '/app/debts', '/app/monitoring', '/app/users', '/app/transferred', '/app/kassa', '/app/kirim-chiqim'];
const TAB_LABELS: Record<string, string> = {
  '/app': 'Asosiy', '/app/products': 'Ombor', '/app/sales': 'Sotildi', '/app/debts': 'Qarzdorlik',
  '/app/monitoring': 'Hisobot', '/app/users': 'Filiallar', '/app/transferred': 'Berildi',
  '/app/kassa': 'Kassa', '/app/kirim-chiqim': 'Kirim', '/app/profile': 'Kabinet',
};

function NavLinks({
  visible,
  pathname,
  onClose,
}: {
  visible: typeof LINKS;
  pathname: string;
  onClose?: () => void;
}) {
  return (
    <nav className="tenant-nav">
      {visible.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname === link.href || pathname.startsWith(`${link.href}/`);
        const icon = NAV_ICONS[link.href] ?? 'home';
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onClose}
            className={`tenant-nav-link btn-with-icon${active ? ' tenant-nav-link--active' : ''}`}
          >
            <Icon name={icon} size={16} />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function TenantNav({
  isAdmin,
  features,
  showImei,
  variant = 'sidebar',
}: {
  isAdmin: boolean;
  features: OrgFeatures;
  showImei: boolean;
  /** 'sidebar' — desktop ro'yxat; 'mobile' — header burger + drawer; 'tabbar' — pastki tab panel */
  variant?: 'sidebar' | 'mobile' | 'tabbar';
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Sahifa o'zgarsa drawer yopilsin
  useEffect(() => { setOpen(false); }, [pathname]);

  // Body scroll bloklansin (faqat mobil drawer uchun)
  useEffect(() => {
    if (variant !== 'mobile') return;
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open, variant]);

  const visible = LINKS.filter((l) => {
    if (l.adminOnly && !isAdmin) return false;
    if (l.branchOnly && isAdmin) return false;
    if (l.feature && !features[l.feature]) return false;
    if (l.imeiOnly && (!showImei || !features.products)) return false;
    return true;
  });

  // Sidebar — faqat desktop ro'yxat
  if (variant === 'sidebar') {
    return (
      <div className="tenant-nav-desktop">
        <NavLinks visible={visible} pathname={pathname} />
      </div>
    );
  }

  // Tabbar — pastki doimiy panel (faqat mobil). Kabinet doim oxirgi.
  if (variant === 'tabbar') {
    const profile = visible.find((l) => l.href === '/app/profile');
    const main = visible
      .filter((l) => TAB_ORDER.includes(l.href))
      .sort((a, b) => TAB_ORDER.indexOf(a.href) - TAB_ORDER.indexOf(b.href))
      .slice(0, 4);
    const tabs = [...main, ...(profile ? [profile] : [])];
    return (
      <nav className="tenant-tabbar">
        {tabs.map((link) => {
          const active = link.exact
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`tenant-tabbar-link${active ? ' tenant-tabbar-link--active' : ''}`}
            >
              <Icon name={NAV_ICONS[link.href] ?? 'home'} size={21} />
              <span>{TAB_LABELS[link.href] ?? link.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  // Mobile — faqat burger tugma + drawer
  return (
    <>
      <button
        className="tenant-burger"
        onClick={() => setOpen(true)}
        aria-label="Menyuni ochish"
      >
        <Icon name="menu" size={22} />
      </button>

      {open && (
        <>
          <div className="tenant-drawer-overlay" onClick={() => setOpen(false)} />
          <div className="tenant-drawer">
            <div className="tenant-drawer-head">
              <span className="tenant-side-name">Menyu</span>
              <button className="tenant-drawer-close" onClick={() => setOpen(false)} aria-label="Yopish">
                <Icon name="close" size={20} />
              </button>
            </div>
            <NavLinks visible={visible} pathname={pathname} onClose={() => setOpen(false)} />
          </div>
        </>
      )}
    </>
  );
}
