import { requireFeature, requireOrgAdmin } from '@/lib/auth';

export default async function KirimChiqimLayout({ children }: { children: React.ReactNode }) {
  await requireOrgAdmin();
  await requireFeature('kirimChiqim');
  return children;
}
