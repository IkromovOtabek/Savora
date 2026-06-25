import { requireFeature } from '@/lib/auth';

export default async function TransferredLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('transferred');
  return children;
}
