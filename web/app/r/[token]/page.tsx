import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getMasterModels } from '@/lib/masterDb';
import { getTenantModels } from '@/lib/tenantDb';
import { getShopSettings } from '@/lib/shopSettings';
import { parseReceiptToken } from '@/lib/receiptLink';
import PrintReceiptButton from '@/components/tenant/PrintReceiptButton';
import ReceiptPaper from '@/components/tenant/ReceiptPaper';
import { getDict } from '@/lib/i18n/server';
import '@/components/tenant/styles/sales.css';

export async function generateMetadata(): Promise<Metadata> {
  const d = await getDict();
  // Mijoz cheki — qidiruv tizimlariga chiqmaydi
  return { title: d.sales.receipt.metaTitle, robots: { index: false, follow: false } };
}

/**
 * Ochiq chek (login talab qilinmaydi): kassadan "Chekni ulashish" orqali mijozga yuboriladi.
 * Havola imzolangan (lib/receiptLink) — faqat shu xarid qatorlari ko'rinadi, boshqa ma'lumot yo'q.
 */
export default async function PublicReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ref = parseReceiptToken(decodeURIComponent(token));
  if (!ref) notFound();

  const { Organization } = await getMasterModels();
  const org = await Organization.findById(ref.orgId).select('name phone dbName').lean();
  if (!org) notFound();

  const { Sale, ShopSettings } = await getTenantModels(org.dbName);
  const [sales, settings] = await Promise.all([
    Sale.find({ checkoutId: ref.checkoutId, status: { $ne: 'cancelled' } }).sort({ saleNo: 1 }).limit(100).lean(),
    getShopSettings(ShopSettings),
  ]);
  if (!sales.length) notFound();
  const d = await getDict();

  return (
    <main className="sl-receipt-wrap" style={{ padding: '24px 16px' }}>
      <div className="sl-receipt-bar no-print" style={{ justifyContent: 'flex-end' }}>
        <PrintReceiptButton defaultWidth={settings.receipt.paperWidth} />
      </div>
      <ReceiptPaper sales={sales} org={{ name: org.name, phone: org.phone }} receipt={settings.receipt} d={d} publicView />
    </main>
  );
}
