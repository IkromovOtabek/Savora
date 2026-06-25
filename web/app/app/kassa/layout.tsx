import { requireFeature } from '@/lib/auth';

export default async function KassaLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('kassa');
  return children;
}
