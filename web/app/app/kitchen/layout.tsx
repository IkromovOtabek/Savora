import { requireFeature } from '@/lib/auth';
import { requirePermission } from '@/lib/permissionGuard';

/** Oshxona ekrani (KDS): modul `kitchen` + huquq `kitchen.view` */
export default async function KitchenLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('kitchen');
  await requirePermission('kitchen.view');
  return children;
}
