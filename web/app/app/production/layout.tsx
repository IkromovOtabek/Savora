import { redirect } from 'next/navigation';
import { requireFeature } from '@/lib/auth';
import { loadUserPermissions } from '@/lib/permissionGuard';
import { getDict } from '@/lib/i18n/server';
import '@/components/production/common/production.css';

export async function generateMetadata() {
  return { title: (await getDict()).production.orders.title };
}

/**
 * Ishlab chiqarish (/app/production/*): modul `production`; ko'rish — `production.view`, `production.manage` yoki
 * `recipe.manage` (backend o'qish huquqlari bilan bir xil). Tugmalar har hujjatning `can` va meta `can` bo'yicha.
 */
export default async function ProductionLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireFeature('production');
  const perms = await loadUserPermissions(user);
  if (!perms.has('production.view') && !perms.has('production.manage') && !perms.has('recipe.manage')) {
    redirect(`/app/locked?p=${encodeURIComponent('production.view')}`);
  }
  return children;
}
