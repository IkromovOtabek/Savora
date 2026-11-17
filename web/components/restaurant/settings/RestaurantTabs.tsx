'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useDict } from '@/lib/i18n/client';

type TabKey = 'general' | 'tables' | 'stations' | 'menu' | 'reports';

const TABS: { key: TabKey; href: string; need: 'manage' | 'reports'; branch: boolean }[] = [
  { key: 'general', href: '/app/restaurant', need: 'manage', branch: false },
  { key: 'tables', href: '/app/restaurant/tables', need: 'manage', branch: true },
  { key: 'stations', href: '/app/restaurant/stations', need: 'manage', branch: true },
  { key: 'menu', href: '/app/restaurant/menu', need: 'manage', branch: true },
  { key: 'reports', href: '/app/restaurant/reports', need: 'reports', branch: false },
];

interface Props {
  /** `tables.manage` — sozlama tablari */
  canManage: boolean;
  /** `reports.view` — hisobotlar tabi */
  canReports: boolean;
}

/** Hisobotlar sahifasi o'z sarlavhasini chiqaradi — u yerda umumiy sarlavha takrorlanmaydi */
const OWN_HEADER = '/app/restaurant/reports';

function TabsView({ canManage, canReports, branch }: Props & { branch: string | null }) {
  const t = useDict().restaurant.settings;
  const pathname = usePathname();
  const label: Record<TabKey, string> = {
    general: t.tabGeneral,
    tables: t.tabTables,
    stations: t.tabStations,
    menu: t.tabMenu,
    reports: t.tabReports,
  };
  const tabs = TABS.filter((x) => (x.need === 'manage' ? canManage : canReports));
  if (tabs.length < 2) return null;
  return (
    <nav className="rs-tabs no-print" aria-label={t.tabsAria}>
      {tabs.map((x) => {
        const active = x.key === 'general' ? pathname === x.href : pathname === x.href || pathname.startsWith(`${x.href}/`);
        // Admin tanlagan filial tablar orasida saqlanadi
        const href = x.branch && branch ? `${x.href}?branch=${encodeURIComponent(branch)}` : x.href;
        return (
          <Link key={x.key} href={href} aria-current={active ? 'page' : undefined}>
            {label[x.key]}
          </Link>
        );
      })}
    </nav>
  );
}

function TabsWithBranch(props: Props) {
  const branch = useSearchParams().get('branch');
  return <TabsView {...props} branch={branch && /^[a-f0-9]{24}$/i.test(branch) ? branch : null} />;
}

/** Restoran sozlamalari sarlavhasi + tablar: Umumiy · Zal va stollar · Stansiyalar · Menyu · Hisobotlar */
export default function RestaurantTabs({ title, sub, ...props }: Props & { title: string; sub: string }) {
  const pathname = usePathname();
  const ownHeader = pathname === OWN_HEADER || pathname.startsWith(`${OWN_HEADER}/`);
  return (
    <>
      {!ownHeader && (
        <div className="t-page-head no-print">
          <div>
            <h1 className="t-page-title">{title}</h1>
            <p className="t-page-sub">{sub}</p>
          </div>
        </div>
      )}
      <Suspense fallback={<TabsView {...props} branch={null} />}>
        <TabsWithBranch {...props} />
      </Suspense>
    </>
  );
}
