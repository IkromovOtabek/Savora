import { requireFeature } from '@/lib/auth';
import { requirePermission } from '@/lib/permissionGuard';

export default async function AiLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('ai');
  await requirePermission('ai.view');
  return children;
}
