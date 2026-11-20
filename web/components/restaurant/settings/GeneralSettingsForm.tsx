'use client';

import { useState, type CSSProperties } from 'react';
import PriceInput from '@/components/ui/PriceInput';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import { isBrandColor } from '@/lib/restaurant/qr';
import { RESTAURANT_LIMITS, type RestaurantSettings } from '@/lib/restaurant/types';
import { saveRestaurantSettingsAction } from '@/app/actions/restaurant';
import BrandImageField from './BrandImageField';
import CustomerPageSection, { infoDraft, infoErrors, type InfoDraft } from './CustomerPageSection';
import { DEFAULT_BRAND_COLOR as DEFAULT_COLOR, textOnColor } from './color';
import { useRun } from './useRun';

interface Props {
  initial: RestaurantSettings;
  shopName: string;
  /** «Oshxona ekrani» moduli — KDS daqiqalari */
  kitchen: boolean;
  /** «QR-menyu» moduli — menyu manzili */
  qrMenu: boolean;
  /** https://…/m/<slug>/ (mijoz sahifasi — shu manzil oxirgi «/» siz) */
  qrBaseUrl: string;
}

/** Umumiy: xizmat haqi, saboy qadoq, bekor qilish nazorati, KDS vaqtlari, brend, mijoz sahifasi (+ oldindan ko'rish) */
export default function GeneralSettingsForm({ initial, shopName, kitchen, qrMenu, qrBaseUrl }: Props) {
  const d = useDict();
  const t = d.restaurant.settings;
  const { pending, run } = useRun();

  // Mijoz sahifasi: https://…/m/<slug> (QR, nusxalash) va joriy domendagi yo'l («Ochib ko'rish»)
  const pageUrl = qrBaseUrl.replace(/\/+$/, '');
  const pageSlug = decodeURIComponent(pageUrl.slice(pageUrl.lastIndexOf('/') + 1));
  const pagePath = pageUrl.replace(/^https?:\/\/[^/]+/i, '') || '/';
  const [info, setInfo] = useState<InfoDraft>(() => infoDraft(initial.info));
  const infoErr = infoErrors(info, t);
  const infoOk = Object.keys(infoErr).length === 0;

  const [pct, setPct] = useState(String(initial.serviceChargePct ?? 0));
  const [pack, setPack] = useState(initial.takeawayPackFee ? String(initial.takeawayPackFee) : '');
  const [requireVoid, setRequireVoid] = useState(initial.requireVoidReason);
  const [warn, setWarn] = useState(String(initial.kdsWarnMinutes));
  const [alert, setAlert] = useState(String(initial.kdsAlertMinutes));
  const [lowPortions, setLowPortions] = useState(String(initial.lowPortions ?? 5));
  const [logo, setLogo] = useState(initial.brand.logoUrl ?? '');
  const [cover, setCover] = useState(initial.brand.coverUrl ?? '');
  const [color, setColor] = useState(initial.brand.color ?? '');

  const pctNum = Number(pct.replace(',', '.'));
  const pctOk = pct.trim() !== '' && Number.isFinite(pctNum) && pctNum >= 0 && pctNum <= RESTAURANT_LIMITS.maxServiceChargePct;
  const warnNum = Number(warn);
  const alertNum = Number(alert);
  const kdsOk = !kitchen || (Number.isInteger(warnNum) && Number.isInteger(alertNum) && warnNum >= 1 && warnNum <= 240 && alertNum <= 480 && alertNum > warnNum);
  const lowNum = Number(lowPortions);
  const lowOk = lowPortions.trim() !== '' && Number.isInteger(lowNum) && lowNum >= 0 && lowNum <= 1000;
  const colorOk = color === '' || isBrandColor(color);
  const accent = colorOk && color ? color.toUpperCase() : DEFAULT_COLOR;
  const shownPct = pctOk ? Math.round(pctNum * 100) / 100 : 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pctOk || !kdsOk || !lowOk || !colorOk || !infoOk) return;
    run(
      () => saveRestaurantSettingsAction({
        serviceChargePct: shownPct,
        takeawayPackFee: Number(pack || 0),
        requireVoidReason: requireVoid,
        ...(kitchen ? { kdsWarnMinutes: warnNum, kdsAlertMinutes: alertNum } : {}),
        lowPortions: lowNum,
        brand: { logoUrl: logo || null, color: color ? color.toUpperCase() : null, coverUrl: cover || null },
        info: {
          about: info.about,
          address: info.address,
          phone: info.phone,
          workHours: info.workHours,
          instagram: info.instagram,
          telegram: info.telegram,
          takeawayByPhone: info.takeawayByPhone,
        },
      }),
      // Server keltirgan ko'rinish (telefon «+998 …», login @ siz) formaga qaytadi
      { refresh: false, after: (s) => setInfo(infoDraft(s.info)) },
    );
  }

  const previewStyle = { '--rs-accent': accent, '--rs-on-accent': textOnColor(accent) } as CSSProperties;

  return (
    <div className="rs-split">
      <form className="rs-stack" onSubmit={submit} noValidate>
        <section className="rs-card rs-form" aria-labelledby="rs-g-service">
          <h2 className="rs-h" id="rs-g-service">{t.serviceTitle}</h2>
          <div className="rs-grid2">
            <div className="auth-field">
              <label htmlFor="rs-pct">{t.serviceChargePct}</label>
              <input
                id="rs-pct"
                type="number"
                inputMode="decimal"
                min={0}
                max={RESTAURANT_LIMITS.maxServiceChargePct}
                step="any"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                aria-invalid={!pctOk}
                aria-describedby="rs-pct-law"
              />
            </div>
            <div className="auth-field">
              <label htmlFor="rs-pack">{t.takeawayPackFee}</label>
              <PriceInput id="rs-pack" value={pack} onValueChange={setPack} placeholder="0" />
              <small className="rs-hint">{t.packFeeHint}</small>
            </div>
          </div>
          <p className="rs-law" id="rs-pct-law">{t.serviceChargeLaw}</p>
        </section>

        <section className="rs-card rs-form" aria-labelledby="rs-g-control">
          <h2 className="rs-h" id="rs-g-control">{t.controlTitle}</h2>
          <label className="rs-toggle">
            <span>
              <b>{t.requireVoidReason}</b>
              <small>{t.requireVoidReasonHint}</small>
            </span>
            <input type="checkbox" checked={requireVoid} onChange={(e) => setRequireVoid(e.target.checked)} />
          </label>
          {kitchen && (
            <fieldset className="rs-fieldset">
              <legend className="rs-label">{t.kdsTitle}</legend>
              <p className="rs-hint">{t.kdsHint}</p>
              <div className="rs-grid2">
                <div className="auth-field">
                  <label htmlFor="rs-warn"><i className="rs-dot rs-dot--warn" aria-hidden="true" />{t.kdsWarnMinutes}</label>
                  <input id="rs-warn" type="number" inputMode="numeric" min={1} max={240} value={warn} onChange={(e) => setWarn(e.target.value)} aria-invalid={!kdsOk} />
                </div>
                <div className="auth-field">
                  <label htmlFor="rs-alert"><i className="rs-dot rs-dot--bad" aria-hidden="true" />{t.kdsAlertMinutes}</label>
                  <input id="rs-alert" type="number" inputMode="numeric" min={2} max={480} value={alert} onChange={(e) => setAlert(e.target.value)} aria-invalid={!kdsOk} aria-describedby={kdsOk ? undefined : 'rs-kds-err'} />
                </div>
              </div>
              {!kdsOk && <small className="rs-error" id="rs-kds-err" role="alert">{t.kdsOrderError}</small>}
            </fieldset>
          )}
          {/* Bildirishnomalar (lib/restaurant/stockAlerts.ts): taomga oz porsiya qolganda */}
          <fieldset className="rs-fieldset">
            <legend className="rs-label">{d.notify.settings.title}</legend>
            <p className="rs-hint">{d.notify.settings.hint}</p>
            <div className="auth-field">
              <label htmlFor="rs-low">{d.notify.settings.lowPortions} ({d.notify.settings.lowPortionsUnit})</label>
              <input
                id="rs-low"
                type="number"
                inputMode="numeric"
                min={0}
                max={1000}
                step={1}
                value={lowPortions}
                onChange={(e) => setLowPortions(e.target.value)}
                aria-invalid={!lowOk}
                aria-describedby="rs-low-hint"
              />
              <small className="rs-hint" id="rs-low-hint">{lowOk ? d.notify.settings.lowPortionsHint : d.notify.settings.lowPortionsBad}</small>
            </div>
            <p className="rs-hint">{d.notify.settings.minStockHint}</p>
          </fieldset>
        </section>

        <section className="rs-card rs-form" aria-labelledby="rs-g-brand">
          <div>
            <h2 className="rs-h" id="rs-g-brand">{t.brand}</h2>
            <p className="rs-hint">{t.brandHint}</p>
          </div>
          <BrandImageField label={t.logo} hint={t.logoHint} value={logo} onChange={setLogo} shape="square" disabled={pending} />
          <BrandImageField label={t.cover} hint={t.coverHint} value={cover} onChange={setCover} shape="wide" disabled={pending} />
          <div className="rs-color">
            <label className="rs-label" htmlFor="rs-color-hex">{t.color}</label>
            <div className="rs-color-row">
              <input
                type="color"
                className="rs-swatch"
                value={accent.toLowerCase()}
                onChange={(e) => setColor(e.target.value.toUpperCase())}
                aria-label={t.color}
              />
              <input
                id="rs-color-hex"
                className="input rs-hex"
                value={color}
                placeholder={DEFAULT_COLOR}
                maxLength={7}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setColor(v && !v.startsWith('#') ? `#${v}` : v);
                }}
                aria-label={t.colorHex}
                aria-invalid={!colorOk}
                aria-describedby={colorOk ? undefined : 'rs-color-err'}
              />
              {color && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setColor('')}>{t.colorReset}</button>
              )}
            </div>
            {!colorOk && <small className="rs-error" id="rs-color-err" role="alert">{t.colorBad}</small>}
          </div>
          {qrMenu && (
            <div className="rs-url">
              <span className="rs-label">{t.menuUrl}</span>
              <code>{qrBaseUrl}…</code>
              <small className="rs-hint">{t.menuUrlHint}</small>
            </div>
          )}
        </section>

        <CustomerPageSection
          shopName={shopName}
          slug={pageSlug}
          pageUrl={pageUrl}
          pagePath={pagePath}
          qrMenu={qrMenu}
          value={info}
          onChange={(patch) => setInfo((v) => ({ ...v, ...patch }))}
          errors={infoErr}
          disabled={pending}
        />

        <div className="rs-savebar">
          <button type="submit" className="btn btn-primary" disabled={pending || !pctOk || !kdsOk || !lowOk || !colorOk || !infoOk}>
            {pending ? d.common.saving : d.common.save}
          </button>
        </div>
      </form>

      <aside className="rs-preview" aria-label={t.preview} style={previewStyle}>
        <span className="rs-preview-l">{t.preview}</span>

        <div className="rs-pv-phone" role="img" aria-label={`${t.previewMenu}: ${shopName}`}>
          <div className="rs-pv-cover" style={cover ? { backgroundImage: `url("${cover}")` } : undefined} />
          <div className="rs-pv-id">
            <span className="rs-pv-logo">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" />
              ) : (
                <b>{shopName.slice(0, 1).toUpperCase()}</b>
              )}
            </span>
            <span className="rs-pv-name">
              <b>{shopName}</b>
              <small>{tr(d.restaurant.common.tableN, { n: 5 })}</small>
            </span>
          </div>
          <p className="rs-pv-note">{shownPct > 0 ? tr(t.previewService, { pct: shownPct }) : t.previewNoService}</p>
          <span className="rs-pv-cat">{t.previewCategory}</span>
          <div className="rs-pv-dish">
            <span className="rs-pv-dish-img" />
            <span className="rs-pv-dish-t">
              <b>{t.previewDish}</b>
              <small>{fmtMoney(45000)} {d.common.sum}</small>
            </span>
            <span className="rs-pv-add">{t.previewAdd}</span>
          </div>
        </div>

        <div className="rs-pv-receipt" role="img" aria-label={`${t.previewReceipt}: ${shopName}`}>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="rs-pv-rlogo" />
          )}
          <b>{shopName}</b>
          <hr />
          <div className="rs-pv-rrow"><span>{t.previewDish}</span><span>{fmtMoney(45000)}</span></div>
          {shownPct > 0 && (
            <div className="rs-pv-rrow">
              <span>{tr(d.restaurant.common.serviceChargeLine, { pct: shownPct })}</span>
              <span>{fmtMoney(Math.round((45000 * shownPct) / 100))}</span>
            </div>
          )}
          <hr />
          <div className="rs-pv-rrow rs-pv-rtotal">
            <span>{d.common.total}</span>
            <b>{fmtMoney(45000 + Math.round((45000 * shownPct) / 100))}</b>
          </div>
        </div>
      </aside>
    </div>
  );
}
