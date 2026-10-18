import { requireFeature } from '@/lib/auth';
import { requirePermission } from '@/lib/permissionGuard';

/** Yetkazib beruvchilar — ombor moduli va "Yetkazib beruvchilar" huquqi bo'lganlarga ochiq. */
export default async function SuppliersLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('products');
  await requirePermission('suppliers.manage');
  return children;
}
