import { requireSuperAdmin } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import SuperExpiryBanner from '@/components/SuperExpiryBanner';
import SuperShell from '@/components/super/SuperShell';
import '@/components/super/super.css';

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();

  // Sidebar hisoblagichlari (kutilayotgan to'lovlar, do'konlar soni)
  const { PaymentRequest, Organization } = await getMasterModels();
  const [pendingPayments, orgCount] = await Promise.all([
    PaymentRequest.countDocuments({ status: 'pending' }),
    Organization.countDocuments(),
  ]);

  return (
    <SuperShell pendingPayments={pendingPayments} orgCount={orgCount}>
      <SuperExpiryBanner />
      {children}
    </SuperShell>
  );
}
