import Link from 'next/link';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { getShopSettings } from '@/lib/shopSettings';
import { ReceiptSettingsForm } from '@/components/tenant/ShopSettingsForms';
import { getDict } from '@/lib/i18n/server';
import '@/components/tenant/styles/shopSettings.css';

export async function generateMetadata() {
  return { title: (await getDict()).shell.shopSettings.metaTitle };
}

const TABS = ['receipt'] as const;
type Tab = (typeof TABS)[number];

/** Do'kon sozlamalari (BILLZ: Sozlamalar) — chek, valyuta, bildirishnomalar */
export default async function ShopSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as Tab) : 'receipt';
  const { org, ShopSettings } = await getTenantAdminSession();
  const k = (await getDict()).shell.shopSettings;
  const settings = await getShopSettings(ShopSettings);
  const label: Record<Tab, string> = { receipt: k.tabReceipt };

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{k.title}</h1>
          <p className="t-page-sub">{k.sub}</p>
        </div>
      </div>

      <nav className="ss-tabs" aria-label={k.title}>
        {TABS.map((t) => (
          <Link key={t} href={t === 'receipt' ? '/app/settings' : `/app/settings?tab=${t}`} aria-current={tab === t ? 'page' : undefined}>
            {label[t]}
          </Link>
        ))}
      </nav>

      {tab === 'receipt' && (
        <ReceiptSettingsForm initial={settings.receipt} shop={{ name: org.name, phone: org.phone }} />
      )}
    </>
  );
}
