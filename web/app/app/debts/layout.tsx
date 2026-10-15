import { requireFeature } from '@/lib/auth';

export default async function DebtsLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('sales');
  return children;
}
