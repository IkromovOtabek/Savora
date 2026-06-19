import { requireFeature, requireOrgAdmin } from '@/lib/auth';

export default async function CreditKassaLayout({ children }: { children: React.ReactNode }) {
  await requireOrgAdmin();
  await requireFeature('creditKassa');
  return children;
}
