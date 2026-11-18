'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Icon from '@/components/icons/Icon';
import BrandMark from '@/components/BrandMark';
import ThemeToggle from '@/components/ThemeToggle';
import LangSwitch from '@/components/LangSwitch';
import { buyerLogoutAction } from '@/app/actions/market';
import { useDict } from '@/lib/i18n/client';
import { useCart } from './cart';

/** Bozor sarlavhasi: logo, qidiruv, savat (son bilan), xaridor menyusi, biznes uchun havola */
export default function MarketHeader({ buyer }: { buyer: { name: string } | null }) {
  const d = useDict();
  const t = d.ecom.market;
  const sp = useSearchParams();
  const { count, ready } = useCart();

  return (
    <header className="mk-head">
      <div className="mk-wrap mk-head-in">
        <Link href="/market" className="mk-brand" aria-label={d.ecom.brand}>
          <BrandMark size={30} />
          <b>Savora <em>Market</em></b>
        </Link>
        <form action="/market" method="get" className="mk-search" role="search">
          <input name="q" type="search" defaultValue={sp.get('q') ?? ''} placeholder={t.searchPh} aria-label={t.searchPh} autoComplete="off" />
          <button type="submit" aria-label={t.search}><Icon name="search" size={18} /></button>
        </form>
        <nav className="mk-nav" aria-label={d.ecom.brand}>
          <Link href="/market/cart" className="mk-nav-a" aria-label={t.nav.cart}>
            <Icon name="cart" size={20} />
            <span className="mk-lbl">{t.nav.cart}</span>
            {ready && count > 0 && <span className="mk-badge">{count}</span>}
          </Link>
          {buyer ? (
            <>
              <Link href="/market/orders" className="mk-nav-a" aria-label={t.nav.orders}>
                <Icon name="user" size={20} />
                <span className="mk-lbl">{t.nav.orders}</span>
              </Link>
              <form action={buyerLogoutAction}>
                <button type="submit" className="mk-nav-a" aria-label={t.nav.logout}><Icon name="logout" size={18} /></button>
              </form>
            </>
          ) : (
            <Link href="/market/login" className="mk-nav-a" aria-label={t.nav.login}>
              <Icon name="login" size={20} />
              <span className="mk-lbl">{t.nav.login}</span>
            </Link>
          )}
          <Link href="/" className="mk-nav-a mk-nav-a--biz">{t.forBusiness}</Link>
          <ThemeToggle />
          <LangSwitch compact />
        </nav>
      </div>
    </header>
  );
}
