import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { loadUserPermissions } from '@/lib/permissionGuard';
import Icon, { type IconName } from '@/components/icons/Icon';
import { getDict } from '@/lib/i18n/server';
import '@/components/tenant/styles/reports.css';

export async function generateMetadata() {
  return { title: (await getDict()).shell.reports.hubMeta };
}

/** Hisobotlar markazi — BILLZ uslubidagi kartalar; faqat ochiq modul va huquqqa mos hisobotlar */
export default async function ReportsHub() {
  const { user, features } = await getTenantSession();
  const perms = await loadUserPermissions(user);
  const r = (await getDict()).shell.reports;

  const cards: { key: keyof typeof r.cards; href: string; icon: IconName; show: boolean }[] = [
    { key: 'sellers', href: '/app/reports/sellers', icon: 'users', show: features.sales },
    { key: 'products', href: '/app/reports/products', icon: 'box', show: features.sales },
    { key: 'overview', href: '/app/monitoring', icon: 'chart', show: true },
    { key: 'shifts', href: '/app/shifts', icon: 'clock', show: features.kassa && perms.has('kassa.view') },
    { key: 'debts', href: '/app/debts', icon: 'bell', show: features.sales },
    { key: 'writeoff', href: '/app/write-off', icon: 'trash', show: features.products && perms.has('stock.adjust') },
    { key: 'ai', href: '/app/ai', icon: 'sparkles', show: features.ai && perms.has('ai.view') },
  ];

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{r.hubTitle}</h1>
          <p className="t-page-sub">{r.hubSub}</p>
        </div>
      </div>
      <ul className="rp-cards">
        {cards.filter((c) => c.show).map((c) => (
          <li key={c.key}>
            <Link href={c.href} className="rp-card">
              <span className="rp-card-ic" aria-hidden="true"><Icon name={c.icon} size={20} /></span>
              <b>{r.cards[c.key].t}</b>
              <span>{r.cards[c.key].d}</span>
              <span className="rp-card-go">{r.open}<Icon name="arrowRight" size={14} /></span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
