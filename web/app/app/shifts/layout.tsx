import { requireFeature } from '@/lib/auth';
import { requirePermission } from '@/lib/permissionGuard';

export default async function ShiftsLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('kassa');
  await requirePermission('kassa.view');
  return children;
}
