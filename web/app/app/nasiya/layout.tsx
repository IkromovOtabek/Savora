import { requireFeature } from '@/lib/auth';
import { requirePermission } from '@/lib/permissionGuard';

export default async function NasiyaLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('nasiya');
  await requirePermission('nasiya.view');
  return <>{children}</>;
}
