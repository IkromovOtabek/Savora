import { requireFeature } from '@/lib/auth';

export default async function NasiyaLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('nasiya');
  return <>{children}</>;
}
