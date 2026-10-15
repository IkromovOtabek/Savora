import { requireOrgAdmin } from '@/lib/auth';
import { requireFeature } from '@/lib/auth';
import { isImeiEnabled } from '@/lib/features';
import { redirect } from 'next/navigation';

export default async function ImeiLayout({ children }: { children: React.ReactNode }) {
  await requireOrgAdmin();
  // Do'kon sessiyadan (requireFeature → sessiya organizationId)
  const { org } = await requireFeature('products');
  if (!org || !isImeiEnabled(org)) redirect('/app');
  return children;
}
