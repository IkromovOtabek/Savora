import Link from 'next/link';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { getShopSettings } from '@/lib/shopSettings';
import { ReceiptSettingsForm, CurrencySettingsForm, NotifySettingsForm } from '@/components/tenant/ShopSettingsForms';
import { getUsdRate } from '@/lib/currency';
import { getDict } from '@/lib/i18n/server';
import '@/components/tenant/styles/shopSettings.css';

export async function generateMetadata() {
  return { title: (await getDict()).shell.shopSettings.metaTitle };
}

const TABS = ['receipt', 'currency', 'notify'] as const;
type Tab = (typeof TABS)[number];

/** Do'kon sozlamalari (BILLZ: Sozlamalar) — chek, valyuta, bildirishnomalar */
export default async function ShopSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as Tab) : 'receipt';
  const { org, ShopSettings } = await getTenantAdminSession();
  const k = (await getDict()).shell.shopSettings;
  const settings = await getShopSettings(ShopSettings);
  const label: Record<Tab, string> = { receipt: k.tabReceipt, currency: k.tabCurrency, notify: k.tabNotify };
  // Valyuta tabida CBU kursi eskirgan bo'lsa yangilanadi
  const usd = tab === 'currency' ? await getUsdRate(ShopSettings) : null;

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
      {tab === 'currency' && usd && (
        <CurrencySettingsForm
          initial={{ rateMode: settings.currency.rateMode, manualRate: settings.currency.manualRate }}
          cbu={{ rate: usd.cbuRate, date: usd.cbuDate }}
          active={usd.rate}
        />
      )}
      {tab === 'notify' && <NotifySettingsForm initial={settings.notify} telegram={!!org.telegramChatId} />}
    </>
  );
}
