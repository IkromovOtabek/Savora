import { getTenantSession } from '@/lib/tenantSession';
import { isImeiEnabled } from '@/lib/features';
import { resolveWarehouseBranchId } from '@/lib/warehouseBranch';
import ProductForm from '@/components/tenant/ProductForm';

export const metadata = { title: 'Yangi mahsulot — Savora' };

export default async function NewProductPage() {
  const { Branch, org, features } = await getTenantSession();
  const branches = await Branch.find({ active: true }).sort({ name: 1 }).lean();
  const warehouseBranchId = (await resolveWarehouseBranchId(Branch)) ?? '';

  return (
    <ProductForm
      mode="create"
      showImei={isImeiEnabled(org)}
      mediaEnabled={features.mediaUpload}
      warehouseBranchId={warehouseBranchId}
      branches={branches.map((b) => ({ id: String(b._id), name: b.name }))}
    />
  );
}
