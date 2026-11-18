import { requireFeature } from '@/lib/auth';
import '@/components/tenant/styles/finance.css';
import '@/components/production/piecework/piecework.css';

/** Ishbay (/app/piecework, /app/piecework/print): modul `piecework`; huquq — sahifalarda (log yoki approve) */
export default async function PieceworkLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('piecework');
  return children;
}
