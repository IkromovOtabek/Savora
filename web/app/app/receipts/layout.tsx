import { redirect } from 'next/navigation';
import { requireFeature } from '@/lib/auth';
import { loadUserPermissions } from '@/lib/permissionGuard';
import '@/components/production/receipts/receipts.css';

/**
 * Kirim aktlari (/app/receipts/*) — `purchasing` moduli. Ko'rish: kirim akti, xarid yoki yetkazib beruvchilarni
 * ko'rish huquqi (lib/production/receipts.ts READ_PERMS); yozish huquqi har sahifada `can` bilan.
 */
export default async function ReceiptsLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireFeature('purchasing');
  const perms = await loadUserPermissions(user);
  if (!perms.has('receipt.create') && !perms.has('po.manage') && !perms.has('suppliers.view')) {
    redirect(`/app/locked?p=${encodeURIComponent('receipt.create')}`);
  }
  return children;
}
