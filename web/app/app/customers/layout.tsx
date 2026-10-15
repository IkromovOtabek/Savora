import { requireFeature } from '@/lib/auth';
import { requirePermission } from '@/lib/permissionGuard';

/** Mijozlar bo'limi — sotuv moduli va "Mijozlar" huquqi bo'lganlarga ochiq. */
export default async function CustomersLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('sales');
  await requirePermission('customers.manage');
  return children;
}
