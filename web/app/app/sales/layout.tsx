import { requireFeature } from '@/lib/auth';

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('sales');
  return children;
}
