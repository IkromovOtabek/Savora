import CustomerForm from '@/components/tenant/CustomerForm';
import BackLink from '@/components/ui/BackLink';
import { getTenantSession } from '@/lib/tenantSession';
import '@/components/tenant/styles/clients.css';

export const metadata = { title: 'Yangi mijoz — Savora' };

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const sp = await searchParams;
  const { features } = await getTenantSession();
  return (
    <div className="cl-page cl-narrow">
      <BackLink href={sp?.returnTo === 'sale' ? '/app/sales/new' : '/app/customers'}>
        {sp?.returnTo === 'sale' ? 'Sotuvga qaytish' : 'Mijozlar'}
      </BackLink>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">Yangi mijoz</h1>
          <p className="t-page-sub">Ism va telefon majburiy, qolganlari ixtiyoriy</p>
        </div>
      </div>
      <CustomerForm mode="create" returnTo={sp?.returnTo} mediaEnabled={features.mediaUpload} />
    </div>
  );
}
