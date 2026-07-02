import { requireFeature } from '@/lib/auth';

export default async function DaftarLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('daftar');
  return children;
}
