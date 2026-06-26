import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { isImeiEnabled } from '@/lib/features';
import LogoutButton from '@/components/LogoutButton';
import TenantNav from '@/components/tenant/TenantNav';
import ThemeToggle from '@/components/ThemeToggle';
import SearchParamToast from '@/components/ui/SearchParamToast';
import { Suspense } from 'react';
import BrandMark from '@/components/BrandMark';
import { isOrganizationActive } from '@/lib/models/master/Organization';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, org, features } = await getTenantSession({ allowExpired: true });
  const showImei = isImeiEnabled(org);

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
          <TenantNav isAdmin={user.role === 'admin'} features={features} showImei={showImei} />
        </div>
        <div className="tenant-side-foot">
          <LogoutButton iconOnly />
        </div>
      </aside>
      <div className="tenant-body">
        <header className="tenant-top">
          <div className="tenant-top-left">
            <TenantNav variant="mobile" isAdmin={user.role === 'admin'} features={features} showImei={showImei} />
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
      </div>
    </div>
  );
}
