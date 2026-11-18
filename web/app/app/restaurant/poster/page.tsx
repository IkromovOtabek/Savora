import Link from 'next/link';
import type { CSSProperties } from 'react';
import { toString as qrSvg } from 'qrcode';
import { settingsPageContext } from '@/lib/restaurant/settingsExtra';
import { restaurantSettings } from '@/lib/restaurant/ops';
import { restaurantPagePath } from '@/lib/restaurant/qr';
import { toPublicInfo } from '@/lib/restaurant/info';
import { resolvePublicFileUrl } from '@/lib/fileUrl';
import { siteUrl } from '@/lib/siteUrl';
import { tr } from '@/lib/i18n/fmt';
import PrintButton from '@/components/ui/PrintButton';
import { DEFAULT_BRAND_COLOR, textOnColor } from '@/components/restaurant/settings/color';
import '@/components/restaurant/settings/customer-page.css';

type Size = 'a4' | 'a5';

export async function generateMetadata() {
  const { ctx } = await settingsPageContext();
  return { title: ctx.d.restaurant.settings.posterPageTitle };
}

/**
 * Kirish eshigi plakati (A5 yoki A4): logo, restoran nomi, «Menyu», mijoz sahifasi (/m/<slug>) QR-kodi va
 * qisqa manzil; pastda ish vaqti, telefon, Instagram (kiritilgan bo'lsa). QR — serverda SVG (sahifa ochilishi
 * bilan chop etishga tayyor).
 */
export default async function PosterPage({ searchParams }: { searchParams: Promise<{ size?: string }> }) {
  const sp = await searchParams;
  const size: Size = sp.size === 'a4' ? 'a4' : 'a5';
  const { ctx, org } = await settingsPageContext();
  const d = ctx.d;
  const t = d.restaurant.settings;

  if (!ctx.features.qrMenu) {
    return (
      <div className="rs-qrbar rs-qrbar--pro">
        <span>
          <b>{t.qrPro}</b>
          <small>{t.qrProHint}</small>
        </span>
        <Link href="/app/locked?m=qrMenu" className="btn btn-sm btn-ghost">{d.common.details}</Link>
      </div>
    );
  }

  const settings = await restaurantSettings(ctx.m);
  const url = `${siteUrl()}${restaurantPagePath(org.slug)}`;
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    await qrSvg(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#000000', light: '#ffffff' } }),
  )}`;
  const brand = settings.brand;
  const logo = brand.logoUrl ? resolvePublicFileUrl(brand.logoUrl) : null;
  const accent = brand.color || DEFAULT_BRAND_COLOR;
  const style = { '--rs-accent': accent, '--rs-on-accent': textOnColor(accent) } as CSSProperties;
  const info = toPublicInfo(settings.info);
  const foot = [info.workHours, info.phone, info.instagram ? `@${info.instagram}` : null].filter((x): x is string => !!x);
  const sizeLabel = size.toUpperCase();

  return (
    <div className="rs-poster-wrap">
      {/* Faqat shu sahifada: qog'oz o'lchami (global qoida — 80 mm chek) */}
      <style>{`@media print{@page{size:${sizeLabel} portrait;margin:8mm}}`}</style>

      <div className="rs-poster-bar no-print">
        <Link href="/app/restaurant#rs-customer" className="back-link">‹ {t.tabGeneral}</Link>
        <div className="rs-card-head">
          <div>
            <h2 className="rs-h">{t.posterPageTitle}</h2>
            <p className="rs-hint">{tr(t.posterPrintHint, { size: sizeLabel })}</p>
          </div>
          <PrintButton label={d.common.print} />
        </div>
        <nav className="rs-chips" aria-label={t.posterSize}>
          {(['a5', 'a4'] as const).map((s) => (
            <Link
              key={s}
              href={`/app/restaurant/poster?size=${s}`}
              className={`rs-chip${s === size ? ' is-on' : ''}`}
              aria-current={s === size ? 'page' : undefined}
            >
              <span>{s.toUpperCase()}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="rs-poster-stage">
        <article className={`rs-poster rs-poster--${size}`} style={style} aria-label={t.posterPageTitle}>
          <div className="rs-poster-band" />
          <header className="rs-poster-id">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="rs-poster-logo" />
            ) : (
              <span className="rs-poster-mark" aria-hidden="true">{org.name.trim().charAt(0).toUpperCase() || '•'}</span>
            )}
            <p className="rs-poster-name">{org.name}</p>
          </header>
          <h1 className="rs-poster-title">{t.posterTitle}</h1>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={tr(t.pageQrAlt, { name: org.name })} className="rs-poster-qr" />
          <div>
            <p className="rs-poster-scan">{t.posterScan}</p>
            <p className="rs-poster-url">{url.replace(/^https?:\/\//, '')}</p>
          </div>
          {foot.length ? (
            <footer className="rs-poster-foot">
              {foot.map((x) => <span key={x}>{x}</span>)}
            </footer>
          ) : <span aria-hidden="true" />}
        </article>
      </div>
    </div>
  );
}
