import { requireFeature } from '@/lib/auth';
import { requirePermission } from '@/lib/permissionGuard';
import '@/components/tenant/styles/sales.css';

export default async function TransferredLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('transferred');
  await requirePermission('transferred.view');
  return children;
}
