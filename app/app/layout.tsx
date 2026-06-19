import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { isImeiEnabled } from '@/lib/features';
import LogoutButton from '@/components/LogoutButton';
import TenantNav from '@/components/tenant/TenantNav';
import TenantClock from '@/components/tenant/TenantClock';
import ThemeToggle from '@/components/ThemeToggle';
import SearchParamToast from '@/components/ui/SearchParamToast';
import { Suspense } from 'react';
import ExpiryBanner from '@/components/ExpiryBanner';
import BrandMark from '@/components/BrandMark';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, org, features } = await getTenantSession();
  const showImei = isImeiEnabled(org);

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
      </aside>
      <div className="tenant-body">
        <header className="tenant-top">
          <div className="tenant-top-left">
            <TenantNav variant="mobile" isAdmin={user.role === 'admin'} features={features} showImei={showImei} />
            <TenantClock />
          </div>
          <div className="tenant-top-center">{org.name}</div>
          <div className="tenant-top-actions">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>
        <main className="tenant-main">
          <Suspense fallback={null}><SearchParamToast /></Suspense>
          <ExpiryBanner org={org} />
          {children}
        </main>
      </div>
    </div>
  );
}
