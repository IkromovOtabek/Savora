import { Suspense } from 'react';
import Link from 'next/link';
import { getBuyer } from '@/lib/ecom/buyerAuth';
import { getDict } from '@/lib/i18n/server';
import { CartProvider } from '@/components/market/cart';
import MarketHeader from '@/components/market/MarketHeader';
import '@/components/market/market.css';

export async function generateMetadata() {
  const t = (await getDict()).ecom.market;
  return { title: t.metaTitle, description: t.metaDesc };
}

/** Savora Market — ochiq bozor. Xaridor sessiyasi do'kon sessiyasidan alohida (lib/ecom/buyerAuth) */
export default async function MarketLayout({ children }: { children: React.ReactNode }) {
  const [buyer, d] = await Promise.all([getBuyer(), getDict()]);
  return (
    <CartProvider>
      <div className="mk">
        <Suspense fallback={<header className="mk-head"><div className="mk-wrap mk-head-in" /></header>}>
          <MarketHeader buyer={buyer ? { name: buyer.name } : null} />
        </Suspense>
        <main className="mk-main">
          <div className="mk-wrap">{children}</div>
        </main>
        <footer className="mk-foot">
          <div className="mk-wrap">
            <span>© Savora Market · {d.ecom.market.footer}</span>
            <Link href="/">{d.ecom.market.forBusiness}</Link>
          </div>
        </footer>
      </div>
    </CartProvider>
  );
}
