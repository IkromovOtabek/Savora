'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FeatureKey, OrgFeatures } from '@/lib/features';
import Icon, { IconName } from '@/components/icons/Icon';
import LogoutButton from '@/components/LogoutButton';
import ThemeToggle from '@/components/ThemeToggle';
import type { PermissionKey } from '@/lib/permissions';

const NAV_ICONS: Record<string, IconName> = {
  '/app': 'home',
  '/app/sales': 'cart',
  '/app/debts': 'bell',
  '/app/kassa': 'wallet',
  '/app/products': 'box',
  '/app/inventory': 'clipboard',
  '/app/imei': 'search',
  '/app/monitoring': 'chart',
  '/app/users': 'users',
  '/app/profile': 'settings',
  '/app/kirim-chiqim': 'repeat',
  '/app/kredit-kassa': 'plans',
  '/app/customers': 'user',
  '/app/branches': 'building',
  '/app/transferred': 'send',
  '/app/audit': 'history',
  '/app/daftar': 'edit',
  '/app/nasiya': 'clock',
  '/app/ai': 'sparkles',
  '/app/tasks': 'check',
};

type NavLink = {
  href: string;
  label: string;
  /** modul o'chiq bo'lsa yashiriladi */
  feature?: FeatureKey;
  /** xodimda huquq bo'lmasa yashiriladi */
  permission?: PermissionKey;
  adminOnly?: boolean;
  imeiOnly?: boolean;
  exact?: boolean;
};

type NavGroup = { title: string; links: NavLink[] };

// Bo'limlar bo'yicha guruhlangan menyu. Ko'rinish qoidalari (modul, huquq, admin) o'zgarmagan.
const GROUPS: NavGroup[] = [
  {
    title: 'Savdo',
    links: [
      // Bosh sahifa endi admin uchun ham ko'rinadi (dashboard admin'da barcha filiallar bo'yicha ishlaydi)
      { href: '/app', label: 'Bosh sahifa', exact: true },
      { href: '/app/sales', label: 'Sotuvlar', feature: 'sales' },
      { href: '/app/transferred', label: 'Filialga berildi', feature: 'transferred' },
    ],
  },
  {
    title: 'Mijozlar',
    links: [
      { href: '/app/nasiya', label: 'Nasiya', feature: 'nasiya' },
      { href: '/app/debts', label: 'Qarzdorlik', feature: 'sales' },
      { href: '/app/customers', label: 'Mijozlar', feature: 'sales', permission: 'customers.manage' },
      { href: '/app/daftar', label: 'Daftar', feature: 'daftar', permission: 'daftar.manage' },
    ],
  },
  {
    title: 'Ombor',
    links: [
      { href: '/app/products', label: 'Ombor', feature: 'products' },
      { href: '/app/inventory', label: 'Inventar', feature: 'inventory' },
      { href: '/app/imei', label: 'IMEI qidirish', imeiOnly: true, adminOnly: true },
    ],
  },
  {
    title: 'Moliya',
    links: [
      { href: '/app/kassa', label: 'Naqd kassa', feature: 'kassa', permission: 'kassa.view' },
      { href: '/app/kredit-kassa', label: 'Kredit kassa', feature: 'creditKassa', adminOnly: true },
      { href: '/app/kirim-chiqim', label: 'Kirim-chiqim', feature: 'kirimChiqim', permission: 'kirimChiqim.manage', adminOnly: true },
      { href: '/app/monitoring', label: 'Hisobot', feature: 'monitoring', permission: 'reports.view' },
    ],
  },
  {
    title: 'Boshqaruv',
    links: [
      { href: '/app/ai', label: 'AI yordamchi', feature: 'ai', permission: 'ai.view' },
      { href: '/app/tasks', label: 'Topshiriqlar', feature: 'tasks' },
      { href: '/app/users', label: 'Filiallar', feature: 'users', permission: 'users.manage', adminOnly: true },
      { href: '/app/audit', label: 'Amallar', feature: 'audit', permission: 'audit.view', adminOnly: true },
      { href: '/app/profile', label: 'Kabinet' },
    ],
  },
];

// Pastki tab bar — eng muhim 4 ta havola (ko'rinadiganlaridan birinchi 4 tasi), qolgani «Yana» oynasida
const TAB_ORDER = ['/app', '/app/sales', '/app/products', '/app/debts', '/app/nasiya', '/app/kassa', '/app/monitoring', '/app/transferred'];
const TAB_LABELS: Record<string, string> = {
  '/app': 'Asosiy', '/app/sales': 'Sotuvlar', '/app/products': 'Ombor', '/app/debts': 'Qarzlar',
  '/app/nasiya': 'Nasiya', '/app/kassa': 'Kassa', '/app/monitoring': 'Hisobot', '/app/transferred': 'Berildi',
};

function isActive(link: NavLink, pathname: string): boolean {
  return link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`);
}

function Count({ n, onBrand }: { n: number; onBrand?: boolean }) {
  if (n <= 0) return null;
  return (
    <span className={`t-nav-count${onBrand ? ' t-nav-count--on' : ''}`} aria-label={`${n} ta`}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

function GroupList({
  groups,
  pathname,
  badges,
  onNavigate,
}: {
  groups: NavGroup[];
  pathname: string;
  badges?: Record<string, number>;
  onNavigate?: () => void;
}) {
  return (
    <>
      {groups.map((g) => (
        <div className="t-nav-group" key={g.title}>
          <h5 className="t-nav-group-title">{g.title}</h5>
          <ul className="t-nav-list">
            {g.links.map((link) => {
              const active = isActive(link, pathname);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={`t-nav-link${active ? ' is-active' : ''}`}
                  >
                    <Icon name={NAV_ICONS[link.href] ?? 'home'} size={17} className="t-nav-icon" />
                    <span className="t-nav-label">{link.label}</span>
                    <Count n={badges?.[link.href] ?? 0} onBrand={active} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

export default function TenantNav({
  isAdmin,
  features,
  showImei,
  permissions,
  badges,
  orgName,
  username,
  variant = 'sidebar',
}: {
  isAdmin: boolean;
  features: OrgFeatures;
  showImei: boolean;
  /** Joriy foydalanuvchi huquqlari (server'da hisoblanadi). Berilmasa — tekshirilmaydi */
  permissions?: readonly PermissionKey[];
  /** Havola yonidagi son (masalan Qarzdorlik soni). href -> son */
  badges?: Record<string, number>;
  /** «Yana» oynasidagi profil qatori uchun */
  orgName?: string;
  username?: string;
  /** 'sidebar' — desktop guruhlangan ro'yxat; 'tabbar' — mobil pastki panel + «Yana» oynasi */
  variant?: 'sidebar' | 'tabbar';
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);

  const allowed = (l: NavLink) => {
    if (l.adminOnly && !isAdmin) return false;
    if (l.feature && !features[l.feature]) return false;
    if (l.permission && permissions && !permissions.includes(l.permission)) return false;
    if (l.imeiOnly && (!showImei || !features.products)) return false;
    return true;
  };

  const groups = GROUPS
    .map((g) => ({ ...g, links: g.links.filter(allowed) }))
    .filter((g) => g.links.length > 0);

  const close = useCallback(() => {
    setOpen(false);
    moreBtnRef.current?.focus();
  }, []);

  // Sahifa o'zgarsa oyna yopilsin
  useEffect(() => { setOpen(false); }, [pathname]);

  // Oyna ochiq: body scroll bloklanadi, Escape yopadi, Tab oyna ichida aylanadi
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const sheet = sheetRef.current;
    const focusables = () =>
      Array.from(sheet?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []);
    focusables()[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  if (variant === 'sidebar') {
    return (
      <nav className="t-nav" aria-label="Asosiy menyu">
        <GroupList groups={groups} pathname={pathname} badges={badges} />
      </nav>
    );
  }

  // Tabbar — 4 ta asosiy havola + «Yana»
  const flat = groups.flatMap((g) => g.links);
  const tabs = flat
    .filter((l) => TAB_ORDER.includes(l.href))
    .sort((a, b) => TAB_ORDER.indexOf(a.href) - TAB_ORDER.indexOf(b.href))
    .slice(0, 4);
  const tabHrefs = new Set(tabs.map((t) => t.href));
  const restGroups = groups
    .map((g) => ({ ...g, links: g.links.filter((l) => !tabHrefs.has(l.href)) }))
    .filter((g) => g.links.length > 0);
  const moreActive = restGroups.some((g) => g.links.some((l) => isActive(l, pathname)));
  const moreCount = restGroups.reduce((s, g) => s + g.links.reduce((a, l) => a + (badges?.[l.href] ?? 0), 0), 0);

  return (
    <>
      <nav className="t-tabbar" aria-label="Pastki menyu">
        {tabs.map((link) => {
          const active = isActive(link, pathname);
          const count = badges?.[link.href] ?? 0;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={`t-tab${active ? ' is-active' : ''}`}
            >
              <span className="t-tab-icon">
                <Icon name={NAV_ICONS[link.href] ?? 'home'} size={22} />
                {count > 0 && <span className="t-tab-dot" aria-label={`${count} ta`}>{count > 99 ? '99+' : count}</span>}
              </span>
              <span className="t-tab-label">{TAB_LABELS[link.href] ?? link.label}</span>
            </Link>
          );
        })}
        <button
          ref={moreBtnRef}
          type="button"
          className={`t-tab${moreActive || open ? ' is-active' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <span className="t-tab-icon">
            <Icon name="grid" size={22} />
            {moreCount > 0 && <span className="t-tab-dot" aria-label={`${moreCount} ta`}>{moreCount > 99 ? '99+' : moreCount}</span>}
          </span>
          <span className="t-tab-label">Yana</span>
        </button>
      </nav>

      {open && (
        <>
          <div className="t-sheet-backdrop" onClick={close} aria-hidden="true" />
          <div
            ref={sheetRef}
            className="t-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="t-sheet-title"
          >
            <div className="t-sheet-grabber" aria-hidden="true" />
            <div className="t-sheet-head">
              <h2 id="t-sheet-title" className="t-sheet-title">Menyu</h2>
              <button type="button" className="t-sheet-close" onClick={close} aria-label="Yopish">
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="t-sheet-body">
              {(orgName || username) && (
                <div className="t-sheet-org">
                  <span className="t-avatar" aria-hidden="true">{(orgName ?? username ?? 'S').slice(0, 1).toUpperCase()}</span>
                  <span className="t-sheet-org-text">
                    <b>{orgName}</b>
                    <small>{username}{isAdmin ? ' · Admin' : ' · Xodim'}</small>
                  </span>
                </div>
              )}
              <GroupList groups={restGroups} pathname={pathname} badges={badges} onNavigate={() => setOpen(false)} />
              <div className="t-sheet-actions">
                <ThemeToggle />
                <LogoutButton className="t-sheet-logout" />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
