import { requireFeature } from '@/lib/auth';
import '@/components/tenant/styles/sales.css';

export default async function TransferredLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('transferred');
  return children;
}
