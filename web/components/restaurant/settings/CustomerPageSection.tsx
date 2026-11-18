'use client';

import { useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { toast } from '@/lib/toast';
import { INFO_LIMITS, parseInstagram, parsePhone, parseTelegram } from '@/lib/restaurant/info';
import type { RestaurantInfo } from '@/lib/restaurant/types';
import QrCode from './QrCode';
import './customer-page.css';

/** Forma qoralamasi (kiritilganicha; saqlashda server lib/restaurant/info.ts bo'yicha keltiradi) */
export interface InfoDraft {
  about: string;
  address: string;
  phone: string;
  workHours: string;
  instagram: string;
  telegram: string;
  takeawayByPhone: boolean;
}

export function infoDraft(i: RestaurantInfo | undefined): InfoDraft {
  return {
    about: i?.about ?? '',
    address: i?.address ?? '',
    phone: i?.phone ?? '',
    workHours: i?.workHours ?? '',
    instagram: i?.instagram ? `@${i.instagram}` : '',
    telegram: i?.telegram ? `@${i.telegram}` : '',
    takeawayByPhone: !!i?.takeawayByPhone,
  };
}

export type InfoErrors = Partial<Record<'phone' | 'instagram' | 'telegram' | 'takeawayByPhone', string>>;

/** Maydon xatolari (bo'sh — xato yo'q): forma saqlashni shu bo'yicha to'xtatadi */
export function infoErrors(v: InfoDraft, t: { badPhone: string; badInstagram: string; badTelegram: string; takeawayNeedsPhone: string }): InfoErrors {
  const e: InfoErrors = {};
  const phone = parsePhone(v.phone);
  if (phone === null) e.phone = t.badPhone;
  if (parseInstagram(v.instagram) === null) e.instagram = t.badInstagram;
  if (parseTelegram(v.telegram) === null) e.telegram = t.badTelegram;
  if (v.takeawayByPhone && !phone) e.takeawayByPhone = t.takeawayNeedsPhone;
  return e;
}

function fileName(slug: string, ext: string) {
  return `${slug}-menyu-qr.${ext}`;
}

function save(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * «Mijoz sahifasi» bloki (Restoran sozlamalari → Umumiy): /m/<slug> havolasi (nusxalash, ochib ko'rish),
 * QR (PNG/SVG yuklab olish, A5/A4 plakat) va aloqa maydonlari. Maydonlar holati — ota formada (bitta «Saqlash»).
 */
export default function CustomerPageSection({
  shopName,
  slug,
  pageUrl,
  pagePath,
  qrMenu,
  value,
  onChange,
  errors,
  disabled,
}: {
  shopName: string;
  slug: string;
  /** Mutlaq manzil (QR va nusxalash uchun) */
  pageUrl: string;
  /** Joriy domendagi yo'l («Ochib ko'rish») */
  pagePath: string;
  /** QR-menyu moduli (Pro): yo'q bo'lsa havola/QR o'rniga tarif haqida */
  qrMenu: boolean;
  value: InfoDraft;
  onChange: (patch: Partial<InfoDraft>) => void;
  errors: InfoErrors;
  disabled?: boolean;
}) {
  const d = useDict();
  const t = d.restaurant.settings;
  const [busy, setBusy] = useState<'png' | 'svg' | null>(null);
  // Xato maydondan chiqqandan keyin ko'rinadi (yozish paytida emas); saboy belgisi — darhol
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const touch = (k: string) => setTouched((s) => (s.has(k) ? s : new Set(s).add(k)));
  const shown = (k: keyof InfoErrors): string | undefined => (k === 'takeawayByPhone' || touched.has(k) ? errors[k] : undefined);

  async function copy() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      toast(t.linkCopied, 'success');
    } catch {
      // Xavfsiz bo'lmagan kontekst yoki ruxsat yo'q — havolani belgilab qo'yamiz
      const el = document.getElementById('rs-cp-url');
      const sel = window.getSelection();
      if (el && sel) {
        const r = document.createRange();
        r.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      toast(t.copyFailed, 'warn');
    }
  }

  async function download(fmt: 'png' | 'svg') {
    if (busy) return;
    setBusy(fmt);
    try {
      const m = await import('qrcode');
      // CommonJS paket: bundler nomlangan eksportni `default` ichida berishi mumkin
      const QR = (m as unknown as { default?: typeof m }).default ?? m;
      const opts = { errorCorrectionLevel: 'M' as const, margin: 2, color: { dark: '#000000', light: '#ffffff' } };
      if (fmt === 'png') {
        save(await QR.toDataURL(pageUrl, { ...opts, width: 1024 }), fileName(slug, 'png'));
      } else {
        const svg = await QR.toString(pageUrl, { ...opts, type: 'svg' });
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        save(url, fileName(slug, 'svg'));
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch {
      toast(t.downloadFailed, 'error');
    } finally {
      setBusy(null);
    }
  }

  const field = (key: 'address' | 'workHours' | 'instagram' | 'telegram', label: string, ph: string, max: number, extra: { type?: string; inputMode?: 'text' | 'url' } = {}) => {
    const err = key === 'instagram' || key === 'telegram' ? shown(key) : undefined;
    return (
      <div className="auth-field">
        <label htmlFor={`rs-cp-${key}`}>{label}</label>
        <input
          id={`rs-cp-${key}`}
          type={extra.type ?? 'text'}
          inputMode={extra.inputMode}
          value={value[key]}
          placeholder={ph}
          maxLength={max}
          autoComplete="off"
          spellCheck={key === 'address' || key === 'workHours'}
          onChange={(e) => onChange({ [key]: e.target.value })}
          onBlur={() => touch(key)}
          disabled={disabled}
          aria-invalid={!!err}
          aria-describedby={err ? `rs-cp-${key}-err` : undefined}
        />
        {err ? <small className="rs-error" id={`rs-cp-${key}-err`} role="alert">{err}</small> : null}
      </div>
    );
  };

  return (
    <section className="rs-card rs-form" id="rs-customer" aria-labelledby="rs-g-customer">
      <div>
        <h2 className="rs-h" id="rs-g-customer">{t.customerPage}</h2>
        <p className="rs-hint">{t.customerPageHint}</p>
      </div>

      {qrMenu ? (
        <div className="rs-cp">
          <div className="rs-cp-qr">
            <QrCode value={pageUrl} alt={tr(t.pageQrAlt, { name: shopName })} size={148} />
          </div>
          <div className="rs-cp-main">
            <div className="rs-url">
              <span className="rs-label">{t.customerPageLink}</span>
              <code id="rs-cp-url">{pageUrl}</code>
            </div>
            <div className="rs-cp-actions">
              <button type="button" className="btn btn-sm btn-tinted btn-with-icon" onClick={copy}>
                <Icon name="clipboard" size={15} /> {t.copyLink}
              </button>
              <a className="btn btn-sm btn-tinted btn-with-icon" href={pagePath} target="_blank" rel="noopener">
                <Icon name="eye" size={15} /> {t.openPage}
              </a>
            </div>
            <div className="rs-cp-actions" role="group" aria-label={t.downloadQr}>
              <span className="rs-cp-l">{t.downloadQr}</span>
              {(['png', 'svg'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  className="btn btn-sm btn-ghost btn-with-icon"
                  onClick={() => download(fmt)}
                  disabled={!!busy}
                  aria-busy={busy === fmt}
                  aria-label={tr(t.downloadAria, { fmt: fmt.toUpperCase() })}
                >
                  <Icon name="download" size={15} /> {fmt === 'png' ? t.downloadPng : t.downloadSvg}
                </button>
              ))}
            </div>
            <div className="rs-cp-actions" role="group" aria-label={t.printPoster}>
              <span className="rs-cp-l">{t.printPoster}</span>
              {(['a5', 'a4'] as const).map((size) => (
                <Link key={size} href={`/app/restaurant/poster?size=${size}`} className="btn btn-sm btn-ghost">
                  {size.toUpperCase()}
                </Link>
              ))}
            </div>
            <small className="rs-hint">{t.posterHint}</small>
          </div>
        </div>
      ) : (
        <div className="rs-qrbar rs-qrbar--pro">
          <span>
            <b>{t.qrPro}</b>
            <small>{t.qrProHint}</small>
          </span>
          <Link href="/app/locked?m=qrMenu" className="btn btn-sm btn-ghost">{d.common.details}</Link>
        </div>
      )}

      <fieldset className="rs-fieldset">
        <legend className="rs-label">{t.contactsTitle}</legend>
        <p className="rs-hint">{t.contactsHint}</p>
        <div className="auth-field">
          <label htmlFor="rs-cp-about">{t.about}</label>
          <textarea
            id="rs-cp-about"
            rows={3}
            value={value.about}
            placeholder={t.aboutPh}
            maxLength={INFO_LIMITS.about}
            onChange={(e) => onChange({ about: e.target.value })}
            disabled={disabled}
          />
        </div>
        {field('address', t.address, t.addressPh, INFO_LIMITS.address)}
        <div className="rs-grid2">
          <div className="auth-field">
            <label htmlFor="rs-cp-phone">{t.phone}</label>
            <input
              id="rs-cp-phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={value.phone}
              placeholder="+998 90 123 45 67"
              maxLength={INFO_LIMITS.phone}
              onChange={(e) => onChange({ phone: e.target.value })}
              onBlur={() => touch('phone')}
              disabled={disabled}
              aria-invalid={!!shown('phone')}
              aria-describedby={shown('phone') ? 'rs-cp-phone-err' : undefined}
            />
            {shown('phone') ? <small className="rs-error" id="rs-cp-phone-err" role="alert">{shown('phone')}</small> : null}
          </div>
          {field('workHours', t.workHours, t.workHoursPh, INFO_LIMITS.workHours)}
          {field('instagram', t.instagram, t.instagramPh, 120, { inputMode: 'url' })}
          {field('telegram', t.telegram, t.telegramPh, 120, { inputMode: 'url' })}
        </div>
        <label className="rs-toggle">
          <span>
            <b>{t.takeawayByPhone}</b>
            <small id="rs-cp-take-hint" className={errors.takeawayByPhone ? 'rs-error' : undefined} role={errors.takeawayByPhone ? 'alert' : undefined}>
              {errors.takeawayByPhone ?? t.takeawayByPhoneHint}
            </small>
          </span>
          <input
            type="checkbox"
            checked={value.takeawayByPhone}
            onChange={(e) => onChange({ takeawayByPhone: e.target.checked })}
            disabled={disabled}
            aria-invalid={!!errors.takeawayByPhone}
            aria-describedby="rs-cp-take-hint"
          />
        </label>
      </fieldset>
    </section>
  );
}
