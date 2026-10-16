import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { isImeiEnabled } from '@/lib/features';
import { branchFilter } from '@/lib/branchScope';
import { openTaskFilter } from '@/lib/tasks';
import { sanitizeNavLayout } from '@/lib/navConfig';
import LogoutButton from '@/components/LogoutButton';
import TenantNav from '@/components/tenant/TenantNav';
import ThemeToggle from '@/components/ThemeToggle';
import SearchParamToast from '@/components/ui/SearchParamToast';
import { Suspense } from 'react';
import BrandMark from '@/components/BrandMark';
import { isOrganizationActive } from '@/lib/models/master/Organization';
import { loadUserPermissions } from '@/lib/permissionGuard';
import Icon from '@/components/icons/Icon';
import { SaleFab, ToolbarTitle } from '@/components/tenant/ShellChrome';
import LangSwitch from '@/components/LangSwitch';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import './tenant.css';
import '@/components/ui/ux.css';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, org, features, Sale, Task, User } = await getTenantSession({ allowExpired: true });
  const d = await getDict();
  const showImei = isImeiEnabled(org);
  const permissions = [...(await loadUserPermissions(user))];

  // Sidebar badge'lar — faol qarzdor sotuvlar. Filial login faqat o'zinikini sanaydi.
  const scope = branchFilter(user);
  const [debtCount, nasiyaCount, openTaskCount, navUser] = await Promise.all([
    // Qarzdorlik — barcha qisman to'langan (qoldiqli) sotuvlar
    features.sales
      ? Sale.countDocuments({ ...scope, status: 'partial', remainingAmount: { $gt: 0 } })
      : Promise.resolve(0),
    // Nasiya — faqat bo'lib to'lash (installment) turidagi qoldiqli sotuvlar
    features.nasiya
      ? Sale.countDocuments({ ...scope, paymentType: 'installment', status: 'partial', remainingAmount: { $gt: 0 } })
      : Promise.resolve(0),
    // Topshiriqlar — bajarilmagan (indeksli countDocuments, arzon)
    features.tasks
      ? Task.countDocuments(openTaskFilter(user)).catch(() => 0)
      : Promise.resolve(0),
    // Shaxsiy menyu tartibi (Menyuni sozlash)
    User.findById(user.id).select('navLayout').lean().catch(() => null),
  ]);
  const navBadges: Record<string, number> = { '/app/debts': debtCount, '/app/nasiya': nasiyaCount, '/app/tasks': openTaskCount };

  // Muddati tugagan — sidebarsiz, faqat to'lov devori (children = /app/expired)
  if (!isOrganizationActive(org)) {
    return (
      <div className="t-expired">
        <header className="t-toolbar t-toolbar--plain">
          <span className="t-toolbar-brand t-toolbar-brand--show"><BrandMark size={24} /></span>
          <div className="t-toolbar-title">{org.name}</div>
          <div className="t-toolbar-actions">
            <ThemeToggle />
            <LogoutButton iconOnly />
          </div>
        </header>
        <main className="t-main">{children}</main>
      </div>
    );
  }

  const isAdmin = user.role === 'admin';
  const canSell = features.sales && permissions.includes('sale.create');
  const navProps = { isAdmin, features, showImei, permissions, badges: navBadges, layout: sanitizeNavLayout(navUser?.navLayout) };

  return (
    <div className="t-shell">
      <a href="#t-main" className="t-skip">{d.common.skipToContent}</a>
      <aside className="t-side" aria-label={d.shell.layout.sidePanel}>
        <Link href="/app" className="t-org">
          <span className="t-org-mark"><BrandMark size={26} /></span>
          <span className="t-org-text">
            <b>{org.name}</b>
            <small>Savora</small>
          </span>
        </Link>
        <div className="t-side-scroll">
          <TenantNav {...navProps} />
        </div>
        <div className="t-side-user">
          <Link href="/app/profile" className="t-side-user-link" title={d.common.profile}>
            <span className="t-avatar" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</span>
            <span className="t-side-user-text">
              <b>{user.username}</b>
              <small>{d.catalog.roles[isAdmin ? 'admin' : 'user']}</small>
            </span>
          </Link>
          <LangSwitch compact />
          <LogoutButton iconOnly />
        </div>
      </aside>
      <div className="t-body">
        <header className="t-toolbar">
          <Link href="/app" className="t-toolbar-brand" aria-label={d.common.home}>
            <BrandMark size={24} />
          </Link>
          <ToolbarTitle orgName={org.name} />
          {features.products && (
            <form action="/app/products" method="get" role="search" className="t-search">
              <Icon name="search" size={16} />
              <input
                type="search"
                name="q"
                placeholder={d.shell.layout.searchStock}
                aria-label={d.shell.layout.searchStock}
                autoComplete="off"
              />
              <kbd aria-hidden="true">⌘K</kbd>
            </form>
          )}
          <div className="t-toolbar-actions">
            {canSell && (
              <Link href="/app/sales/new" className="t-btn t-btn--filled t-toolbar-sale ux-hide-mobile">
                <Icon name="plus" size={16} />
                <span>{d.shell.layout.newSale}</span>
              </Link>
            )}
            {features.sales && (
              <Link href="/app/debts" className="t-icon-btn" aria-label={`${d.shell.layout.debts}${debtCount > 0 ? `: ${tr(d.common.nPcs, { n: debtCount })}` : ''}`} title={d.shell.layout.debts}>
                <Icon name="bell" size={18} />
                {debtCount > 0 && <span className="t-icon-dot" aria-hidden="true" />}
              </Link>
            )}
            <ThemeToggle />
          </div>
        </header>
        <main className={`t-main${canSell ? ' t-main--fab' : ''}`} id="t-main" tabIndex={-1}>
          <Suspense fallback={null}><SearchParamToast /></Suspense>
          {children}
        </main>
        {/* Mobil asosiy amal — faqat sotuv huquqi va moduli bo'lsa (toolbar tugmasi bilan bir xil shart) */}
        {canSell && <SaleFab />}
        {/* Pastki tab panel + «Yana» oynasi — faqat mobil (CSS bilan) */}
        <TenantNav variant="tabbar" {...navProps} orgName={org.name} username={user.username} />
      </div>
    </div>
  );
}
