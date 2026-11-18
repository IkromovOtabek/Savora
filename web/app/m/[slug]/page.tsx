import { cache, type CSSProperties } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Icon, { type IconName } from '@/components/icons/Icon';
import { getI18n } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { hitRateLimit } from '@/lib/rateLimit';
import { clientIpFrom } from '@/lib/security';
import { siteUrl } from '@/lib/siteUrl';
import { loadPublicStorePage, type PublicStorePage } from '@/lib/restaurant/public';
import { instagramUrl, telegramUrl, telHref } from '@/lib/restaurant/info';
import { restaurantPagePath } from '@/lib/restaurant/qr';
import { LIMITS } from '@/app/api/public/menu/_shared';
import { MenuHead, MenuHero, ServiceNote } from '@/components/restaurant/qr/MenuHeader';
import StoreMenu from '@/components/restaurant/qr/StoreMenu';
import QrState from '@/components/restaurant/qr/QrState';
import { onColor } from '@/components/restaurant/qr/cart';
import '@/components/restaurant/qr/qr-menu.css';

/**
 * Restoranning umumiy mijoz sahifasi (ochiq, login yo'q, stolsiz): /m/<do'kon slug>.
 * Brend, tavsif, aloqa (manzil, telefon, ish vaqti, Instagram/Telegram), xizmat haqi e'loni va menyu
 * (faqat ko'rish). Buyurtma BERILMAYDI — «stoldagi QR'ni skanerlang»; restoran telefon orqali saboy qabul
 * qilsa — raqam. Stol sahifasidan (/m/<slug>/<token>, noindex) farqli — qidiruvga ochiq.
 * Ma'lumot serverda (tez birinchi ochilish), ochiq API bilan bir manba va kesh (lib/restaurant/public →
 * loadPublicStorePage, 30 s) va bir xil rate-limit kaliti.
 */

type Params = { params: Promise<{ slug: string }> };

type Loaded = { kind: 'ok'; page: PublicStorePage } | { kind: 'notFound' } | { kind: 'rateLimited' };

// generateMetadata va sahifa bitta so'rovda bir marta o'qiydi (rate-limit ham bir marta)
const load = cache(async (slug: string): Promise<Loaded> => {
  const l = LIMITS.readStore(clientIpFrom(await headers()));
  const rl = await hitRateLimit(l.key, l.max, l.windowMs);
  if (!rl.ok) return { kind: 'rateLimited' };
  const page = await loadPublicStorePage(String(slug));
  return page ? { kind: 'ok', page } : { kind: 'notFound' };
});

/** Qidiruv tavsifi uchun: bir qator, ~160 belgi */
function clip(s: string, max = 160): string {
  const v = s.replace(/\s+/g, ' ').trim();
  return v.length > max ? `${v.slice(0, max - 1).trimEnd()}…` : v;
}

/** /api/uploads/… → mutlaq manzil (JSON-LD rasm) */
function absolute(url: string | null): string | undefined {
  if (!url) return undefined;
  return url.startsWith('/') ? `${siteUrl()}${url}` : url;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { d } = await getI18n();
  const q = d.restaurant.qrMenu;
  const r = await load(slug);
  if (r.kind !== 'ok') {
    return {
      title: r.kind === 'rateLimited' ? q.rateLimitedTitle : q.storeNotFoundTitle,
      robots: { index: false, follow: false },
    };
  }
  const p = r.page;
  const title = tr(q.metaTitle, { name: p.org.name });
  const description = clip(p.info.about ?? tr(q.storeMetaDesc, { name: p.org.name }));
  const path = restaurantPagePath(p.org.slug);
  const image = p.brand.coverUrl ?? p.brand.logoUrl;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      url: path,
      siteName: p.org.name,
      title,
      description,
      ...(image ? { images: [{ url: image, alt: p.org.name }] } : {}),
    },
    twitter: {
      card: p.brand.coverUrl ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
    robots: { index: true, follow: true },
  };
}

export default async function RestaurantPage({ params }: Params) {
  const { slug } = await params;
  const { d } = await getI18n();
  const q = d.restaurant.qrMenu;
  const r = await load(slug);
  if (r.kind === 'notFound') notFound();
  if (r.kind === 'rateLimited') {
    return (
      <QrState
        icon="clock"
        tone="warn"
        title={q.rateLimitedTitle}
        text={q.rateLimitedText}
        action={<a className="qm-btn qm-btn--ghost" href={restaurantPagePath(slug)}>{d.common.retry}</a>}
      />
    );
  }

  const p = r.page;
  const { info } = p;
  const pct = p.serviceChargePct;
  const brandStyle = p.brand.color
    ? ({ '--qm-brand': p.brand.color, '--qm-on-brand': onColor(p.brand.color) } as CSSProperties)
    : undefined;

  const contacts: { key: string; icon: IconName; label: string; value: string; href?: string; external?: boolean }[] = [];
  if (info.address) contacts.push({ key: 'address', icon: 'map', label: q.address, value: info.address });
  if (info.phone) contacts.push({ key: 'phone', icon: 'phone', label: q.phone, value: info.phone, href: telHref(info.phone) });
  if (info.instagram) contacts.push({ key: 'ig', icon: 'camera', label: q.instagram, value: `@${info.instagram}`, href: instagramUrl(info.instagram), external: true });
  if (info.telegram) contacts.push({ key: 'tg', icon: 'send', label: q.telegram, value: `@${info.telegram}`, href: telegramUrl(info.telegram), external: true });

  const pageUrl = `${siteUrl()}${restaurantPagePath(p.org.slug)}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: p.org.name,
    url: pageUrl,
    hasMenu: pageUrl,
    ...(info.about ? { description: info.about } : {}),
    ...(absolute(p.brand.coverUrl ?? p.brand.logoUrl) ? { image: absolute(p.brand.coverUrl ?? p.brand.logoUrl) } : {}),
    ...(absolute(p.brand.logoUrl) ? { logo: absolute(p.brand.logoUrl) } : {}),
    ...(info.address ? { address: info.address } : {}),
    ...(info.phone ? { telephone: info.phone } : {}),
    ...(info.instagram || info.telegram
      ? { sameAs: [info.instagram && instagramUrl(info.instagram), info.telegram && telegramUrl(info.telegram)].filter(Boolean) }
      : {}),
  };

  return (
    <div className="qm-root qm-root--view" style={brandStyle}>
      <script
        type="application/ld+json"
        // JSON ichidagi «<» — </script> bilan yopilib qolmasin
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <MenuHero coverUrl={p.brand.coverUrl} />

      <div className="qm-wrap">
        <MenuHead name={p.org.name} brand={p.brand}>
          {info.workHours ? (
            <p className="qm-sub">
              <Icon name="clock" size={15} />
              <span><span className="sr-only">{q.workHours}: </span>{info.workHours}</span>
            </p>
          ) : null}
        </MenuHead>

        {info.about ? <p className="qm-about">{info.about}</p> : null}

        <aside className="qm-scan" aria-labelledby="qm-scan-title">
          <span className="qm-scan-ic" aria-hidden><Icon name="qr" size={22} /></span>
          <div>
            <p className="qm-scan-title" id="qm-scan-title">{q.scanToOrder}</p>
            <p className="qm-scan-text">{q.scanToOrderHint}</p>
          </div>
          {info.takeawayByPhone && info.phone ? (
            <a className="qm-btn qm-btn--brand qm-scan-call" href={telHref(info.phone)}>
              <Icon name="phone" size={20} />
              <span className="qm-scan-call-t">
                <small>{q.takeaway}</small>
                <b className="tnum">{info.phone}</b>
              </span>
            </a>
          ) : null}
        </aside>

        {contacts.length ? (
          <section className="qm-info" aria-label={q.infoAria}>
            <ul className="qm-info-list">
              {contacts.map((c) => {
                const body = (
                  <>
                    <span className="qm-info-ic" aria-hidden><Icon name={c.icon} size={18} /></span>
                    <span className="qm-info-t">
                      <small>{c.label}</small>
                      <span className={c.key === 'phone' ? 'tnum' : undefined}>{c.value}</span>
                    </span>
                    {c.href ? <span className="qm-info-go" aria-hidden><Icon name="chevron" size={16} /></span> : null}
                  </>
                );
                return (
                  <li key={c.key}>
                    {c.href ? (
                      <a className="qm-info-row" href={c.href} {...(c.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{body}</a>
                    ) : (
                      <div className="qm-info-row">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {pct > 0 ? <ServiceNote badge={tr(q.serviceBadge, { pct })} text={tr(q.serviceNote, { pct })} /> : null}
      </div>

      <StoreMenu items={p.items} categories={p.categories} />
    </div>
  );
}
