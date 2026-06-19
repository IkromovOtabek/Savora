'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FeatureKey, OrgFeatures } from '@/lib/features';
import Icon, { IconName } from '@/components/icons/Icon';

const NAV_ICONS: Record<string, IconName> = {
  '/app': 'home',
  '/app/sales': 'cart',
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
};

const LINKS: { href: string; label: string; feature?: FeatureKey; adminOnly?: boolean; imeiOnly?: boolean; exact?: boolean }[] = [
  { href: '/app/products', label: 'Ombor', feature: 'products' },
  { href: '/app/sales', label: 'Sotildi', feature: 'sales' },
  { href: '/app/transferred', label: 'Filialga berildi' },
  { href: '/app/kassa', label: 'Naxt kassa', feature: 'kassa' },
  { href: '/app/kirim-chiqim', label: 'Kirim-Chiqim', feature: 'kirimChiqim', adminOnly: true },
  { href: '/app/kredit-kassa', label: 'Kredit kassa', feature: 'creditKassa', adminOnly: true },
  { href: '/app/inventory', label: 'Inventar', feature: 'inventory' },
  { href: '/app/imei', label: 'IMEI qidirish', imeiOnly: true },
  { href: '/app/monitoring', label: 'Hisobot', feature: 'monitoring' },
  { href: '/app/profile', label: 'Kabinet' },
];

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
  /** 'sidebar' — desktop ro'yxat; 'mobile' — header burger + drawer */
  variant?: 'sidebar' | 'mobile';
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
