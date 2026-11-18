import { redirect } from 'next/navigation';
import { getBuyer } from '@/lib/ecom/buyerAuth';
import { getDict } from '@/lib/i18n/server';
import AuthForm from '@/components/market/AuthForm';

export async function generateMetadata() {
  const t = (await getDict()).ecom.market.auth;
  return { title: `${t.loginTitle} · Savora Market`, robots: { index: false } };
}

function safeNext(v?: string): string {
  return v && v.startsWith('/market') && !v.startsWith('//') ? v : '/market';
}

export default async function MarketLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getBuyer()) redirect(next);
  return <AuthForm mode="login" next={next} />;
}
