import { requireFeature } from '@/lib/auth';

export default async function ProductsLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('products');
  return children;
}
