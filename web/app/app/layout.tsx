import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { isImeiEnabled } from '@/lib/features';
import { branchFilter } from '@/lib/branchScope';
import LogoutButton from '@/components/LogoutButton';
import TenantNav from '@/components/tenant/TenantNav';
import ThemeToggle from '@/components/ThemeToggle';
import SearchParamToast from '@/components/ui/SearchParamToast';
import { Suspense } from 'react';
import BrandMark from '@/components/BrandMark';
import { isOrganizationActive } from '@/lib/models/master/Organization';
import { loadUserPermissions } from '@/lib/permissionGuard';
import Icon from '@/components/icons/Icon';
import './tenant.css';
import '@/components/ui/ux.css';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, org, features, Sale } = await getTenantSession({ allowExpired: true });
  const showImei = isImeiEnabled(org);
  const permissions = [...(await loadUserPermissions(user))];

  // Sidebar badge'lar — faol qarzdor sotuvlar. Filial login faqat o'zinikini sanaydi.
  const scope = branchFilter(user);
  const [debtCount, nasiyaCount] = await Promise.all([
    // Qarzdorlik — barcha qisman to'langan (qoldiqli) sotuvlar
    features.sales
      ? Sale.countDocuments({ ...scope, status: 'partial', remainingAmount: { $gt: 0 } })
      : Promise.resolve(0),
    // Nasiya — faqat bo'lib to'lash (installment) turidagi qoldiqli sotuvlar
    features.nasiya
      ? Sale.countDocuments({ ...scope, paymentType: 'installment', status: 'partial', remainingAmount: { $gt: 0 } })
      : Promise.resolve(0),
  ]);
  const navBadges: Record<string, number> = { '/app/debts': debtCount, '/app/nasiya': nasiyaCount };

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
  const navProps = { isAdmin, features, showImei, permissions, badges: navBadges };

  return (
    <div className="t-shell">
      <aside className="t-side" aria-label="Yon panel">
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
        <Link href="/app/profile" className="t-side-user">
          <span className="t-avatar" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</span>
          <span className="t-side-user-text">
            <b>{user.username}</b>
            <small>{isAdmin ? 'Admin' : 'Xodim'}</small>
          </span>
        </Link>
      </aside>
      <div className="t-body">
        <header className="t-toolbar">
          <Link href="/app" className="t-toolbar-brand" aria-label="Bosh sahifa">
            <BrandMark size={24} />
          </Link>
          <div className="t-toolbar-title">{org.name}</div>
          {features.products && (
            <form action="/app/products" method="get" role="search" className="t-search">
              <Icon name="search" size={16} />
              <input
                type="search"
                name="q"
                placeholder="Ombordan qidirish"
                aria-label="Ombordan qidirish"
                autoComplete="off"
              />
              <kbd aria-hidden="true">⌘K</kbd>
            </form>
          )}
          <div className="t-toolbar-actions">
            {canSell && (
              <Link href="/app/sales/new" className="t-btn t-btn--filled t-toolbar-sale">
                <Icon name="plus" size={16} />
                <span>Yangi sotuv</span>
              </Link>
            )}
            {features.sales && (
              <Link href="/app/debts" className="t-icon-btn" aria-label={`Qarzdorlik${debtCount > 0 ? `: ${debtCount} ta` : ''}`} title="Qarzdorlik">
                <Icon name="bell" size={18} />
                {debtCount > 0 && <span className="t-icon-dot" aria-hidden="true" />}
              </Link>
            )}
            <ThemeToggle />
            <span className="t-desktop-only"><LogoutButton iconOnly /></span>
          </div>
        </header>
        <main className="t-main">
          <Suspense fallback={null}><SearchParamToast /></Suspense>
          {children}
        </main>
        {/* Pastki tab panel + «Yana» oynasi — faqat mobil (CSS bilan) */}
        <TenantNav variant="tabbar" {...navProps} orgName={org.name} username={user.username} />
      </div>
    </div>
  );
}
