import { requireFeature } from '@/lib/auth';
import { requirePermission } from '@/lib/permissionGuard';

export default async function DebtsLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('sales');
  await requirePermission('debts.view');
  return children;
}
