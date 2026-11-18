import { redirect } from 'next/navigation';

/** Eski manzil: menyu endi alohida bo'lim — /app/menu (filial tanlovi saqlanadi) */
export default async function RestaurantMenuPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const sp = await searchParams;
  const branch = typeof sp.branch === 'string' && /^[a-f0-9]{24}$/i.test(sp.branch) ? sp.branch : '';
  redirect(branch ? `/app/menu?branch=${branch}` : '/app/menu');
}
