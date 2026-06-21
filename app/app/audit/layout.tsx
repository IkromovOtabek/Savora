import { requireFeature } from '@/lib/auth';

export default async function AuditLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('audit');
  return children;
}
