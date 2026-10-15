import { requireFeature } from '@/lib/auth';
import { requirePermission } from '@/lib/permissionGuard';

export default async function MonitoringLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('monitoring');
  await requirePermission('reports.view');
  return children;
}
