import Link from 'next/link';
import { getDict } from '@/lib/i18n/server';

const TABS = [
  { key: 'tx', href: '/app/finance' },
  { key: 'state', href: '/app/finance/state' },
  { key: 'cat', href: '/app/finance/categories' },
] as const;

export type FinanceTab = (typeof TABS)[number]['key'];

/** Moliya bo'limi tablari — menyuda bitta «Tranzaksiyalar» havolasi, hisoblar holati va toifalar shu yerdan */
export default async function FinanceTabs({ current }: { current: FinanceTab }) {
  const f = (await getDict()).sales.fin;
  const label: Record<FinanceTab, string> = { tx: f.tabTx, state: f.tabState, cat: f.tabCat };
  return (
    <nav className="fx-pages" aria-label={f.pagesAria}>
      {TABS.map((t) => (
        <Link key={t.key} href={t.href} aria-current={current === t.key ? 'page' : undefined}>
          {label[t.key]}
        </Link>
      ))}
    </nav>
  );
}
