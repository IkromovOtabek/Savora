import { requireOrgAdmin } from '@/lib/auth';
import '@/components/tenant/styles/ecom.css';

/** E-commerce (Onlayn do'kon, buyurtmalar) — faqat do'kon egasi */
export default async function EcomLayout({ children }: { children: React.ReactNode }) {
  await requireOrgAdmin();
  return children;
}
