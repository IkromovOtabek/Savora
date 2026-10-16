'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { OrgFeatures } from '@/lib/features';
import Icon from '@/components/icons/Icon';
import LogoutButton from '@/components/LogoutButton';
import ThemeToggle from '@/components/ThemeToggle';
import type { PermissionKey } from '@/lib/permissions';
import { NAV_GROUPS, NAV_ICONS, TAB_ORDER, TAB_LABELS, applyNavLayout, type NavGroup, type NavLink, type NavLayout } from '@/lib/navConfig';
import NavEditor from './NavEditor';
import LangSwitch from '@/components/LangSwitch';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

function isActive(link: NavLink, pathname: string): boolean {
  return link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`);
}

function Count({ n, onBrand }: { n: number; onBrand?: boolean }) {
  const d = useDict();
  if (n <= 0) return null;
  return (
    <span className={`t-nav-count${onBrand ? ' t-nav-count--on' : ''}`} aria-label={tr(d.common.nPcs, { n })}>
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
  const d = useDict();
  return (
    <>
      {groups.map((g) => (
        <div className="t-nav-group" key={g.title}>
          <h5 className="t-nav-group-title">{d.shell.nav.groups[g.title] ?? g.title}</h5>
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
                    <span className="t-nav-label">{d.shell.nav.links[link.href] ?? link.label}</span>
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
  layout,
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
  /** Foydalanuvchining shaxsiy menyu tartibi (User.navLayout) */
  layout?: NavLayout | null;
  /** 'sidebar' — desktop guruhlangan ro'yxat; 'tabbar' — mobil pastki panel + «Yana» oynasi */
  variant?: 'sidebar' | 'tabbar';
}) {
  const pathname = usePathname();
  const d = useDict();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);

  const allowed = (l: NavLink) => {
    if (l.adminOnly && !isAdmin) return false;
    if (l.feature && !features[l.feature]) return false;
    if (l.permission && permissions && !permissions.includes(l.permission)) return false;
    if (l.imeiOnly && (!showImei || !features.products)) return false;
    return true;
  };

  // Foydalanuvchi tartibi qo'llanadi; ruxsat etilmaganlar olib tashlanadi
  const ordered = applyNavLayout(NAV_GROUPS, layout).map((g) => ({ ...g, links: g.links.filter(allowed) }));
  const hiddenSet = new Set(layout?.hidden ?? []);
  const groups = ordered
    .map((g) => ({ ...g, links: g.links.filter((l) => !hiddenSet.has(l.href)) }))
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
    if (editing) {
      return <NavEditor groups={ordered.filter((g) => g.links.length > 0)} hidden={[...hiddenSet]} onDone={() => setEditing(false)} />;
    }
    return (
      <nav className="t-nav" aria-label={d.shell.layout.mainMenu}>
        <GroupList groups={groups} pathname={pathname} badges={badges} />
        <button type="button" className="t-nav-customize" onClick={() => setEditing(true)}>
          <Icon name="edit" size={15} />
          {d.shell.navEditor.title}
        </button>
      </nav>
    );
  }

  // Tabbar — 4 ta asosiy havola + «Yana»
  // Shaxsiy tartib saqlangan bo'lsa — tab bar ham shu tartibda, aks holda standart TAB_ORDER
  const flat = groups.flatMap((g) => g.links);
  const tabs = (layout
    ? flat.filter((l) => l.href in TAB_LABELS)
    : flat.filter((l) => TAB_ORDER.includes(l.href)).sort((a, b) => TAB_ORDER.indexOf(a.href) - TAB_ORDER.indexOf(b.href))
  ).slice(0, 4);
  const tabHrefs = new Set(tabs.map((t) => t.href));
  const restGroups = groups
    .map((g) => ({ ...g, links: g.links.filter((l) => !tabHrefs.has(l.href)) }))
    .filter((g) => g.links.length > 0);
  const moreActive = restGroups.some((g) => g.links.some((l) => isActive(l, pathname)));
  const moreCount = restGroups.reduce((s, g) => s + g.links.reduce((a, l) => a + (badges?.[l.href] ?? 0), 0), 0);

  return (
    <>
      <nav className="t-tabbar" aria-label={d.shell.layout.bottomMenu}>
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
                {count > 0 && <span className="t-tab-dot" aria-label={tr(d.common.nPcs, { n: count })}>{count > 99 ? '99+' : count}</span>}
              </span>
              <span className="t-tab-label">{d.shell.nav.tabs[link.href] ?? d.shell.nav.links[link.href] ?? link.label}</span>
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
            {moreCount > 0 && <span className="t-tab-dot" aria-label={tr(d.common.nPcs, { n: moreCount })}>{moreCount > 99 ? '99+' : moreCount}</span>}
          </span>
          <span className="t-tab-label">{d.common.more}</span>
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
              <h2 id="t-sheet-title" className="t-sheet-title">{d.common.menu}</h2>
              <button type="button" className="t-sheet-close" onClick={close} aria-label={d.common.close}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="t-sheet-body">
              {(orgName || username) && (
                <div className="t-sheet-org">
                  <span className="t-avatar" aria-hidden="true">{(orgName ?? username ?? 'S').slice(0, 1).toUpperCase()}</span>
                  <span className="t-sheet-org-text">
                    <b>{orgName}</b>
                    <small>{username} · {d.catalog.roles[isAdmin ? 'admin' : 'user']}</small>
                  </span>
                </div>
              )}
              <GroupList groups={restGroups} pathname={pathname} badges={badges} onNavigate={() => setOpen(false)} />
              <div className="t-sheet-actions">
                <LangSwitch compact />
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
