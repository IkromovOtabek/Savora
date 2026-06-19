import { requireOrgAdmin } from '@/lib/auth';
import { requireFeature } from '@/lib/auth';
import { resolveTenant } from '@/lib/tenantContext';
import { isImeiEnabled } from '@/lib/features';
import { redirect } from 'next/navigation';

export default async function ImeiLayout({ children }: { children: React.ReactNode }) {
  await requireOrgAdmin();
  await requireFeature('products');
  const org = await resolveTenant();
  if (!org || !isImeiEnabled(org)) redirect('/app');
  return children;
}
