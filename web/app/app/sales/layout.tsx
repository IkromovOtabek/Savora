import { requireFeature } from '@/lib/auth';
import '@/components/tenant/styles/sales.css';

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('sales');
  return children;
}
