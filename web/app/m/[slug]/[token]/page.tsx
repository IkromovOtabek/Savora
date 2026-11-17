import { cache } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getI18n } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { hitRateLimit } from '@/lib/rateLimit';
import { clientIpFrom } from '@/lib/security';
import { publicMenu, publicOrderStatus, resolvePublicTable, type PublicMenu, type PublicOrderStatus } from '@/lib/restaurant/public';
import { qrMenuPath } from '@/lib/restaurant/qr';
import { LIMITS } from '@/app/api/public/menu/_shared';
import QrMenuApp from '@/components/restaurant/qr/QrMenuApp';
import QrState from '@/components/restaurant/qr/QrState';

/**
 * Mijoz QR-menyusi (ochiq, login yo'q): /m/<do'kon slug>/<stol qrToken>.
 * Menyu serverda olinadi (tez birinchi ochilish) — ochiq API bilan bir xil manba va maydonlar
 * (lib/restaurant/public: tannarx, qoldiq, stansiya, xodimlar chiqmaydi) va bir xil rate-limit kaliti.
 * Buyurtma, holat va chaqiruv — client'dan ochiq API orqali (/api/public/menu/...).
 * Asosiy domen, tenant subdomeni va /t/<slug>/m/... (rewrite) yo'llarida bir xil ishlaydi.
 */

type Params = { params: Promise<{ slug: string; token: string }> };

type Loaded =
  | { kind: 'ok'; menu: PublicMenu; status: PublicOrderStatus }
  | { kind: 'notFound' }
  | { kind: 'rateLimited' };

// generateMetadata va sahifa bitta so'rovda bir marta o'qiydi (rate-limit ham bir marta)
const load = cache(async (slug: string, token: string): Promise<Loaded> => {
  const ip = clientIpFrom(await headers());
  for (const l of [LIMITS.readTable(ip, String(token).slice(0, 64)), LIMITS.readIp(ip)]) {
    const rl = await hitRateLimit(l.key, l.max, l.windowMs);
    if (!rl.ok) return { kind: 'rateLimited' };
  }
  const { d } = await getI18n();
  const r = await resolvePublicTable(String(slug), String(token), d);
  if (!r.ok) return { kind: 'notFound' };
  const [menu, status] = await Promise.all([publicMenu(r.data), publicOrderStatus(r.data)]);
  return { kind: 'ok', menu, status };
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, token } = await params;
  const { d } = await getI18n();
  const r = await load(slug, token);
  const q = d.restaurant.qrMenu;
  const title = r.kind === 'ok' ? tr(q.metaTitle, { name: r.menu.org.name }) : r.kind === 'rateLimited' ? q.rateLimitedTitle : q.notFoundTitle;
  return {
    title,
    description: r.kind === 'ok' ? `${r.menu.org.name} · ${tr(q.tableNo, { n: r.menu.table.number })}` : q.notFoundText,
    // Stol havolasi (token) qidiruvga chiqmasin
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    alternates: { canonical: null },
    openGraph: { title, type: 'website' },
    twitter: { card: 'summary', title },
  };
}

export default async function QrMenuPage({ params }: Params) {
  const { slug, token } = await params;
  const { d } = await getI18n();
  const r = await load(slug, token);
  if (r.kind === 'notFound') notFound();
  if (r.kind === 'rateLimited') {
    const q = d.restaurant.qrMenu;
    return (
      <QrState
        icon="clock"
        tone="warn"
        title={q.rateLimitedTitle}
        text={q.rateLimitedText}
        action={<a className="qm-btn qm-btn--ghost" href={qrMenuPath(slug, token)}>{d.common.retry}</a>}
      />
    );
  }
  return <QrMenuApp slug={slug} token={token} menu={r.menu} initialStatus={r.status} />;
}
