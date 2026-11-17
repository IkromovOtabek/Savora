import Link from 'next/link';
import type { CSSProperties } from 'react';
import { toString as qrSvg } from 'qrcode';
import { settingsPageContext } from '@/lib/restaurant/settingsExtra';
import { restaurantSetupView } from '@/lib/restaurant/queries';
import { tr } from '@/lib/i18n/fmt';
import PrintButton from '@/components/ui/PrintButton';
import Icon from '@/components/icons/Icon';
import { DEFAULT_BRAND_COLOR, textOnColor } from '@/components/restaurant/settings/color';

/**
 * QR chop etish varag'i: tanlangan zalning faol stollari uchun A4 kartalar (logo, nom, «Stol №», QR).
 * QR rasmi serverda (SVG) — sahifa ochilishi bilan chop etishga tayyor. QR manzili — setup view `qrUrl`
 * (lib/restaurant/qr.ts → qrMenuPath).
 */
export default async function QrPrintPage({ searchParams }: { searchParams: Promise<{ branch?: string; hall?: string }> }) {
  const sp = await searchParams;
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

  const r = await restaurantSetupView(ctx, { branchId: sp.branch || undefined });
  if (!r.ok) return <p className="t-note t-note--warn" role="alert">{r.error}</p>;
  const { halls, branchId, settings } = r.data;
  const hall = halls.find((h) => h.id === sp.hall) ?? halls[0] ?? null;
  const tables = hall ? r.data.tables.filter((x) => x.hallId === hall.id && x.active) : [];
  const cards = await Promise.all(
    tables.map(async (x) => ({
      id: x.id,
      number: x.number,
      src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        await qrSvg(x.qrUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#000000', light: '#ffffff' } }),
      )}`,
    })),
  );
  const brand = settings.brand;
  const accent = brand.color || DEFAULT_BRAND_COLOR;
  const sheetStyle = { '--rs-accent': accent, '--rs-on-accent': textOnColor(accent) } as CSSProperties;
  const backHref = `/app/restaurant/tables?branch=${branchId}`;

  return (
    <div className="rs-print">
      {/* Faqat shu sahifada: A4 (global qoida — 80 mm chek) */}
      <style>{'@media print{@page{size:A4 portrait;margin:10mm}}'}</style>

      <div className="rs-print-bar no-print">
        <Link href={backHref} className="back-link">‹ {t.tabTables}</Link>
        <div className="rs-card-head">
          <div>
            <h2 className="rs-h">{t.printTitle}</h2>
            {hall && <p className="rs-hint">{tr(t.printSub, { hall: hall.name, n: cards.length })} · {t.printHint}</p>}
          </div>
          {cards.length > 0 && <PrintButton label={d.common.print} />}
        </div>
        {halls.length > 1 && (
          <nav className="rs-chips" aria-label={t.halls}>
            {halls.map((h) => (
              <Link
                key={h.id}
                href={`/app/restaurant/tables/print?hall=${h.id}&branch=${branchId}`}
                className={`rs-chip${h.id === hall?.id ? ' is-on' : ''}${h.active ? '' : ' is-off'}`}
                aria-current={h.id === hall?.id ? 'page' : undefined}
              >
                <span>{h.name}</span>
              </Link>
            ))}
          </nav>
        )}
      </div>

      {cards.length === 0 ? (
        <p className="rs-empty no-print">{hall ? t.printEmpty : t.hallsEmpty}</p>
      ) : (
        <div className="rs-sheet" style={sheetStyle}>
          {cards.map((c) => (
            <article key={c.id} className="rs-qcard">
              <header className="rs-qcard-head">
                {brand.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={brand.logoUrl} alt="" className="rs-qcard-logo" />
                ) : (
                  <span className="rs-qcard-mark" aria-hidden="true"><Icon name="utensils" size={18} /></span>
                )}
                <b>{org.name}</b>
              </header>
              <div className="rs-qcard-no">{tr(t.printTableNo, { n: c.number })}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.src} alt={tr(t.qrTitle, { n: c.number })} className="rs-qcard-qr" />
              <p className="rs-qcard-scan">{t.printScan}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
