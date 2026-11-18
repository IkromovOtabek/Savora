import { redirect } from 'next/navigation';
import { requireFeature } from '@/lib/auth';
import { loadUserPermissions } from '@/lib/permissionGuard';
import '@/components/production/receipts/receipts.css';

/**
 * Yetkazib beruvchiga buyurtmalar (/app/purchase-orders/*) — `purchasing` moduli. Ko'rish: xarid, kirim akti yoki
 * yetkazib beruvchilarni ko'rish huquqi (lib/production/purchaseOrders.ts READ_PERMS); amallar — `can` bo'yicha.
 */
export default async function PurchaseOrdersLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireFeature('purchasing');
  const perms = await loadUserPermissions(user);
  if (!perms.has('po.manage') && !perms.has('receipt.create') && !perms.has('suppliers.view')) {
    redirect(`/app/locked?p=${encodeURIComponent('po.manage')}`);
  }
  return children;
}
