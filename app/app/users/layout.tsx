import { requireFeature, requireOrgAdmin } from '@/lib/auth';

export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  await requireOrgAdmin();
  await requireFeature('users');
  return children;
}
