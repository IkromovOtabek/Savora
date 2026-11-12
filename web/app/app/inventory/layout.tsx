import { requireFeature } from '@/lib/auth';
import { requirePermission } from '@/lib/permissionGuard';
import '@/components/tenant/styles/stock.css';

export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('inventory');
  await requirePermission('inventory.view');
  return children;
}
