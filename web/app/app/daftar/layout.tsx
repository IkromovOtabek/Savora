import { requireFeature } from '@/lib/auth';
import { requirePermission } from '@/lib/permissionGuard';

export default async function DaftarLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('daftar');
  await requirePermission('daftar.manage');
  return children;
}
