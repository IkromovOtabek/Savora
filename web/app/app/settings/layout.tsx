import { requireOrgAdmin } from '@/lib/auth';

export default async function ShopSettingsLayout({ children }: { children: React.ReactNode }) {
  await requireOrgAdmin();
  return children;
}
