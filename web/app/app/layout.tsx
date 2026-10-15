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
      <div className="tenant-expired-wrap">
        <header className="tenant-top tenant-top--expired">
          <div className="tenant-top-center">{org.name}</div>
          <div className="tenant-top-actions">
            <ThemeToggle />
            <LogoutButton iconOnly />
          </div>
        </header>
        <main className="tenant-main">{children}</main>
      </div>
    );
  }

  return (
    <div className="tenant-wrap">
      <aside className="tenant-side">
        <div className="tenant-side-head">
          <Link href="/app" className="tenant-side-brand">
            <span className="brand-mark-wrap">
              <BrandMark size={30} />
            </span>
            <div className="tenant-side-meta">
              <div className="tenant-side-name">Savora</div>
              <div className="tenant-side-login">{user.username}</div>
            </div>
          </Link>
        </div>
        <div className="tenant-side-nav">
          <TenantNav isAdmin={user.role === 'admin'} features={features} showImei={showImei} permissions={permissions} badges={navBadges} />
        </div>
        <div className="tenant-side-foot">
          <LogoutButton iconOnly />
        </div>
      </aside>
      <div className="tenant-body">
        <header className="tenant-top">
          <div className="tenant-top-left">
            <TenantNav variant="mobile" isAdmin={user.role === 'admin'} features={features} showImei={showImei} permissions={permissions} badges={navBadges} />
          </div>
          <div className="tenant-top-center">{org.name}</div>
          <div className="tenant-top-actions">
            <ThemeToggle />
            {/* Mobilda sidebar yashirin — logout shu yerda (faqat mobil) */}
            <span className="logout-mobile-only"><LogoutButton iconOnly /></span>
          </div>
        </header>
        <main className="tenant-main">
          <Suspense fallback={null}><SearchParamToast /></Suspense>
          {children}
        </main>
        {/* Pastki tab panel — faqat mobil (CSS bilan) */}
        <TenantNav variant="tabbar" isAdmin={user.role === 'admin'} features={features} showImei={showImei} permissions={permissions} badges={navBadges} />
      </div>
    </div>
  );
}
