import { requireFeature } from '@/lib/auth';
import '@/components/tenant/styles/stock.css';

export default async function ProductsLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('products');
  return children;
}
