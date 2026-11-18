import { redirect } from 'next/navigation';
import { requireFeature } from '@/lib/auth';
import { loadUserPermissions } from '@/lib/permissionGuard';
import { RECEIPT_READ_PERMS } from '@/lib/production/receipts';
import '@/components/production/receipts/receipts.css';

/**
 * Kirim aktlari (/app/receipts/*) — `purchasing` moduli. Ko'rish: lib/production/receipts.ts → RECEIPT_READ_PERMS
 * (kirim, xarid, yetkazib beruvchilarni ko'rish, ishlab chiqarishni ko'rish); yozish huquqi har sahifada `can` bilan.
 */
export default async function ReceiptsLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireFeature('purchasing');
  const perms = await loadUserPermissions(user);
  if (!RECEIPT_READ_PERMS.some((p) => perms.has(p))) {
    redirect(`/app/locked?p=${encodeURIComponent('receipt.create')}`);
  }
  return children;
}
