import { requireFeature } from '@/lib/auth';
import '@/components/tenant/styles/stock.css';

export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('inventory');
  return children;
}
