import CustomerForm from '@/components/tenant/CustomerForm';
import { getTenantSession } from '@/lib/tenantSession';

export const metadata = { title: 'Yangi mijoz — Savora' };

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const sp = await searchParams;
  const { features } = await getTenantSession();
  return <CustomerForm mode="create" returnTo={sp?.returnTo} mediaEnabled={features.mediaUpload} />;
}
