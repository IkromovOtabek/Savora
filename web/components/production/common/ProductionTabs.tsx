import Link from 'next/link';
import type { Dict } from '@/lib/i18n/dict';

/** Ishlab chiqarish bo'limi tablari: Aktlar · Texkartalar (ro'yxat sahifalarida) */
export default function ProductionTabs({ current, d }: { current: 'orders' | 'recipes'; d: Dict }) {
  const t = d.production;
  return (
    <nav className="pr-tabs no-print" aria-label={t.recipes.tabsAria}>
      <Link href="/app/production" aria-current={current === 'orders' ? 'page' : undefined}>{t.orders.tab}</Link>
      <Link href="/app/production/recipes" aria-current={current === 'recipes' ? 'page' : undefined}>{t.recipes.title}</Link>
    </nav>
  );
}
