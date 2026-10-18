import { requireFeature } from '@/lib/auth';
import { requirePermission } from '@/lib/permissionGuard';

export default async function StockAdjustLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('products');
  await requirePermission('stock.adjust');
  return children;
}
