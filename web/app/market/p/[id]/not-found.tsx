import Link from 'next/link';
import { getDict } from '@/lib/i18n/server';

export default async function ListingNotFound() {
  const t = (await getDict()).ecom.market;
  return (
    <div className="mk-empty">
      <p>{t.notFound}</p>
      <Link href="/market" className="mk-btn">{t.cart.toCatalog}</Link>
    </div>
  );
}
