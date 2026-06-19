import { requireFeature } from '@/lib/auth';

export default async function MonitoringLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('monitoring');
  return children;
}
