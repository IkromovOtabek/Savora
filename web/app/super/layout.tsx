import { requireSuperAdmin } from '@/lib/auth';
import SuperExpiryBanner from '@/components/SuperExpiryBanner';
import SuperSidebar from '@/components/super/SuperSidebar';

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();

  return (
    <div className="super-wrap">
      <SuperSidebar />
      <main className="super-main">
        <SuperExpiryBanner />
        {children}
      </main>
    </div>
  );
}
