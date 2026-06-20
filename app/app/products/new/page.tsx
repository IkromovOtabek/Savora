import { getTenantSession } from '@/lib/tenantSession';
import { isImeiEnabled } from '@/lib/features';
import ProductForm from '@/components/tenant/ProductForm';

export const metadata = { title: 'Yangi mahsulot — Savora' };

export default async function NewProductPage() {
  const { user, Branch, org, features } = await getTenantSession();
  const isAdmin = user.role === 'admin';
  // Admin barcha filialni tanlaydi; filial-login uchun faqat o'z filiali
  const query = isAdmin ? { active: true } : { active: true, _id: user.branchId };
  const branches = await Branch.find(query).sort({ name: 1 }).lean();

  return (
    <ProductForm
      mode="create"
      showImei={isImeiEnabled(org)}
      mediaEnabled={features.mediaUpload}
      isAdmin={isAdmin}
      currentBranchId={user.branchId}
      branches={branches.map((b) => ({ id: String(b._id), name: b.name }))}
    />
  );
}
