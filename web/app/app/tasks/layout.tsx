import { requireFeature } from '@/lib/auth';
import { requirePermission } from '@/lib/permissionGuard';

/** Ko'rish — modul yoqiq bo'lsa har kim (o'z/filial topshiriqlari); boshqarish — tasks.manage */
export default async function TasksLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('tasks');
  await requirePermission('tasks.view');
  return children;
}
