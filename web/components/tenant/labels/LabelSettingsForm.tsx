'use client';

import { useActionState, useMemo, useState } from 'react';
import { saveLabelSettingsAction } from '@/app/actions/labels';
import { labelDocument, labelGeometry, type LabelRenderCtx } from '@/lib/labels/render';
import { printLabelDocument } from '@/lib/labels/print';
import {
  LABEL_FIELDS, LABEL_LIMITS, LABEL_PRESETS, LABEL_TEXT_SIZES,
  type LabelField, type LabelItem, type LabelSettings,
} from '@/lib/labels/settings';
import { useToastOnState } from '@/lib/useToastOnState';
import { useDict } from '@/lib/i18n/client';
import Icon from '@/components/icons/Icon';
import LabelPreview from './LabelPreview';
import '../styles/labels.css';

const isPreset = (w: number, h: number) => LABEL_PRESETS.some((p) => p.w === w && p.h === h);

/** Sozlamalar → «Barkod yorlig'i»: o'lcham, maydonlar, nusxa, avto-chop etish + haqiqiy o'lchamdagi ko'rinish */
export default function LabelSettingsForm({ initial, shopName, phoneShop }: {
  initial: LabelSettings;
  shopName: string;
  phoneShop: boolean;
}) {
  const d = useDict();
  const k = d.labels.settings;
  const [state, action, pending] = useActionState(saveLabelSettingsAction, null);
  useToastOnState(state);
  const [v, setV] = useState<LabelSettings>(initial);
  const [custom, setCustom] = useState(() => !isPreset(initial.width, initial.height));
  // Qo'lda kiritilayotgan o'lcham (yozish paytida noto'g'ri qiymat ko'rinishni buzmasin)
  const [wText, setWText] = useState(String(initial.width));
  const [hText, setHText] = useState(String(initial.height));
  const set = <K extends keyof LabelSettings>(key: K, val: LabelSettings[K]) => setV((p) => ({ ...p, [key]: val }));

  const sample: LabelItem = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return phoneShop
      ? { id: 'sample', name: k.sample.phone, attrs: k.sample.phoneAttrs, code: '356938035643809', codeKind: 'imei', price: 1_850_000, productId: 'PRD-5K2AB7Q', warrantyMonths: 12, date: today, available: 1 }
      : { id: 'sample', name: k.sample.goods, attrs: k.sample.goodsAttrs, code: '4780000000007', codeKind: 'barcode', price: 12_000, productId: 'PRD-5K2AB7Q', warrantyMonths: 6, date: today, available: 1 };
  }, [phoneShop, k.sample]);
  const ctx: LabelRenderCtx = { shopName, texts: { sum: d.labels.paper.sum, warranty: d.labels.paper.warranty } };
  const html = labelDocument([sample], v, ctx, k.title);
  const tight = !!labelGeometry(sample.code, v.width)?.tight;

  function pickPreset(w: number, h: number) {
    setCustom(false);
    setV((p) => ({ ...p, width: w, height: h }));
    setWText(String(w));
    setHText(String(h));
  }
  function onCustom(axis: 'width' | 'height', raw: string) {
    (axis === 'width' ? setWText : setHText)(raw);
    const n = Math.round(Number(raw));
    const [min, max] = axis === 'width' ? [LABEL_LIMITS.minW, LABEL_LIMITS.maxW] : [LABEL_LIMITS.minH, LABEL_LIMITS.maxH];
    if (Number.isFinite(n) && n >= min && n <= max) set(axis, n);
  }
  function toggleField(f: LabelField, on: boolean) {
    setV((p) => ({ ...p, fields: LABEL_FIELDS.filter((x) => (x === f ? on : p.fields.includes(x))) }));
  }

  return (
    <div className="ss-split">
      <form action={action} className="ss-card ss-form">
        <div>
          <h2 className="ss-h">{k.title}</h2>
          <p className="ss-hint">{k.hint}</p>
        </div>

        <fieldset className="ss-field">
          <legend>{k.size}</legend>
          <div className="lb-sizes">
            {LABEL_PRESETS.map((p) => {
              const on = !custom && v.width === p.w && v.height === p.h;
              const s = 30 / Math.max(p.w, p.h);
              return (
                <label key={`${p.w}x${p.h}`} className={on ? 'is-on' : ''}>
                  <input type="radio" name="sizePreset" checked={on} onChange={() => pickPreset(p.w, p.h)} />
                  <i style={{ width: Math.round(p.w * s), height: Math.round(p.h * s) }} aria-hidden="true" />
                  {p.w}×{p.h}
                </label>
              );
            })}
            <label className={custom ? 'is-on' : ''}>
              <input type="radio" name="sizePreset" checked={custom} onChange={() => setCustom(true)} />
              <Icon name="edit" size={16} />
              {k.custom}
            </label>
          </div>
          {custom && (
            <div className="lb-custom">
              <div className="auth-field">
                <label htmlFor="lb-w">{k.width}</label>
                <input id="lb-w" type="number" inputMode="numeric" min={LABEL_LIMITS.minW} max={LABEL_LIMITS.maxW} value={wText} onChange={(e) => onCustom('width', e.target.value)} />
              </div>
              <div className="auth-field">
                <label htmlFor="lb-h">{k.height}</label>
                <input id="lb-h" type="number" inputMode="numeric" min={LABEL_LIMITS.minH} max={LABEL_LIMITS.maxH} value={hText} onChange={(e) => onCustom('height', e.target.value)} />
              </div>
            </div>
          )}
          <input type="hidden" name="width" value={v.width} />
          <input type="hidden" name="height" value={v.height} />
        </fieldset>

        <fieldset className="ss-field">
          <legend>{k.fieldsTitle}</legend>
          <div className="lb-fields">
            {LABEL_FIELDS.map((f) => (
              <label key={f} className="ss-check">
                <input type="checkbox" name="fields" value={f} checked={v.fields.includes(f)} onChange={(e) => toggleField(f, e.target.checked)} />
                {k.fields[f]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="ss-field">
          <legend>{k.textSize}</legend>
          <div className="ss-seg">
            {LABEL_TEXT_SIZES.map((s) => (
              <label key={s} className={v.textSize === s ? 'is-on' : ''}>
                <input type="radio" name="textSize" value={s} checked={v.textSize === s} onChange={() => set('textSize', s)} />
                {k.textSizes[s]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="lb-copies">
          <label htmlFor="lb-copies" className="lb-row-l">{k.copies}</label>
          <div className="lb-step">
            <button type="button" onClick={() => set('copies', Math.max(1, v.copies - 1))} disabled={v.copies <= 1} aria-label="−">−</button>
            <input
              id="lb-copies"
              name="copies"
              type="number"
              inputMode="numeric"
              min={1}
              max={LABEL_LIMITS.maxCopies}
              value={v.copies}
              onChange={(e) => set('copies', Math.min(LABEL_LIMITS.maxCopies, Math.max(1, Math.round(Number(e.target.value) || 1))))}
            />
            <button type="button" onClick={() => set('copies', Math.min(LABEL_LIMITS.maxCopies, v.copies + 1))} disabled={v.copies >= LABEL_LIMITS.maxCopies} aria-label="+">+</button>
          </div>
        </div>

        <label className="ss-toggle">
          <span><b>{k.autoPrint}</b><small>{k.autoPrintSub}</small></span>
          <input type="checkbox" name="autoPrint" value="1" checked={v.autoPrint} onChange={(e) => set('autoPrint', e.target.checked)} />
        </label>

        <button type="submit" className="btn btn-primary" disabled={pending}>{k.save}</button>
      </form>

      <aside className="lb-side" aria-label={k.preview}>
        <span className="ss-preview-l">{k.preview}</span>
        <div className="lb-stage">
          <LabelPreview html={html} width={v.width} height={v.height} maxPx={320} title={k.preview} />
          <span className="lb-size">{v.width} × {v.height} mm</span>
        </div>
        {tight && <div className="auth-alert auth-alert--warn lb-alert" role="status">{k.tight}</div>}
        <div className="lb-side-actions">
          <button type="button" className="btn btn-tinted btn-with-icon" onClick={() => printLabelDocument(html)}>
            <Icon name="barcode" size={17} /> {k.testPrint}
          </button>
        </div>
        <div className="ss-card">
          <h3 className="ss-h" style={{ fontSize: 15, marginBottom: 8 }}>{k.printerTitle}</h3>
          <ol className="lb-steps">
            {k.printerSteps.map((s) => <li key={s}>{s}</li>)}
          </ol>
        </div>
      </aside>
    </div>
  );
}
