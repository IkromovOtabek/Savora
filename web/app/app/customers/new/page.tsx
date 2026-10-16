import CustomerForm from '@/components/tenant/CustomerForm';
import BackLink from '@/components/ui/BackLink';
import { getTenantSession } from '@/lib/tenantSession';
import { getDict } from '@/lib/i18n/server';
import '@/components/tenant/styles/clients.css';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.crm.customers.newMetaTitle };
}

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const sp = await searchParams;
  const { features } = await getTenantSession();
  const d = await getDict();
  const c = d.crm.customers;
  return (
    <div className="cl-page cl-narrow">
      <BackLink href={sp?.returnTo === 'sale' ? '/app/sales/new' : '/app/customers'}>
        {sp?.returnTo === 'sale' ? c.backToSale : c.title}
      </BackLink>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{c.newTitle}</h1>
          <p className="t-page-sub">{c.newSub}</p>
        </div>
      </div>
      <CustomerForm mode="create" returnTo={sp?.returnTo} mediaEnabled={features.mediaUpload} />
    </div>
  );
}
