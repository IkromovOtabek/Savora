import { requireFeature, requireOrgAdmin } from '@/lib/auth';

/** Moliya (tranzaksiyalar, toifalar, hisoblar holati) — butun biznes puli, faqat egasi */
export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  await requireOrgAdmin();
  await requireFeature('kirimChiqim');
  return children;
}
