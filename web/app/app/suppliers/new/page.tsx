import BackLink from '@/components/ui/BackLink';
import { SupplierForm } from '@/components/tenant/SupplierUi';
import { getDict } from '@/lib/i18n/server';
import '@/components/tenant/styles/clients.css';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.stock.suppliers.newMetaTitle };
}

export default async function NewSupplierPage() {
  const d = await getDict();
  const s = d.stock.suppliers;
  return (
    <div className="cl-page cl-narrow">
      <BackLink href="/app/suppliers">{s.title}</BackLink>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{s.newTitle}</h1>
          <p className="t-page-sub">{s.newSub}</p>
        </div>
      </div>
      <SupplierForm mode="create" />
    </div>
  );
}
