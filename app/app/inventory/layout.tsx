import { requireFeature } from '@/lib/auth';

export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('inventory');
  return children;
}
