import '@/components/tenant/styles/import.css';
import { getTenantSession } from '@/lib/tenantSession';
import { requirePermission } from '@/lib/permissionGuard';
import { isPhoneShop } from '@/lib/businessTypes';
import { getDict } from '@/lib/i18n/server';
import { loadExtraFieldNames } from '@/lib/productFields';
import ProductImportWizard from '@/components/tenant/ProductImportWizard';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.importer.metaTitle };
}

export default async function ProductImportPage() {
  await requirePermission('product.create');
  const { user, org, Product } = await getTenantSession();
  // Mavjud qo'shimcha ustun nomlari — moslashda taklif (indeks bo'yicha distinct)
  const extraNames = await loadExtraFieldNames(Product);

  return (
    <ProductImportWizard
      ctx={{ phoneShop: isPhoneShop(org), businessType: org.businessType }}
      isAdmin={user.role === 'admin'}
      extraNames={extraNames}
    />
  );
}
