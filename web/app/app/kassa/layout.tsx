import { requireFeature } from '@/lib/auth';
import { requirePermission } from '@/lib/permissionGuard';

export default async function KassaLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('kassa');
  await requirePermission('kassa.view');
  return children;
}
