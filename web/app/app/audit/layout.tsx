import { requireFeature } from '@/lib/auth';
import { requirePermission } from '@/lib/permissionGuard';

export default async function AuditLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('audit');
  await requirePermission('audit.view');
  return children;
}
