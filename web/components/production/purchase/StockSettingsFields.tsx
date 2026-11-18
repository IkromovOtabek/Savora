'use client';

import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { setStockSettingsAction } from '@/app/actions/receipts';
import { PRODUCT_UNITS, type ProductUnit } from '@/lib/businessTypes';
import { isValidFactor } from '@/lib/production/calc';
import { isFractionalUnit, roundQty } from '@/lib/qty';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import Icon from '@/components/icons/Icon';
import './stockSettings.css';

export interface StockSettingsInitial {
  itemCode: string | null;
  purchaseUnit: ProductUnit | null;
  purchaseFactor: number | null;
  minStock: number | null;
}

/** Mahsulot formasi chaqiradi: o'zgarish bo'lmasa — null, aks holda setStockSettingsAction natijasi */
export interface StockSettingsHandle {
  save: () => Promise<null | { ok: true } | { ok: false; error: string }>;
}

const numText = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
const parseNum = (raw: string): number | null => {
  const s = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Mahsulot kartochkasidagi «Ombor sozlamalari» (tahrir rejimi, sanaladigan tovar): minimal qoldiq (hamma uchun),
 * xarid birligi + koeffitsient («1 qop = 50 kg», faqat `production`/`purchasing` moduli bilan), barqaror kod (ko'rish).
 * O'zi alohida saqlamaydi — mahsulot formasi «Saqlash»da `save()` ni chaqiradi (setStockSettingsAction, product.edit).
 */
export default function StockSettingsFields({
  ref,
  productId,
  baseUnit,
  initial,
  purchasing,
  disabled,
}: {
  ref?: Ref<StockSettingsHandle>;
  productId: string;
  /** Formadagi joriy asosiy birlik (o'zgartirilsa — darhol hisobga olinadi) */
  baseUnit: string;
  initial: StockSettingsInitial;
  /** Xarid birligi maydoni (production yoki purchasing moduli yoqiq) */
  purchasing: boolean;
  disabled?: boolean;
}) {
  const d = useDict();
  const t = d.stock.stockSettings;
  const units = d.stock.fields.units;
  const base = (baseUnit || 'dona') as ProductUnit;
  const [purchaseUnit, setPurchaseUnit] = useState<string>(initial.purchaseUnit ?? '');
  const [factor, setFactor] = useState(numText(initial.purchaseFactor));
  const [minStock, setMinStock] = useState(numText(initial.minStock));
  // Oxirgi saqlangan holat — faqat o'zgargan qism yuboriladi
  const saved = useRef({ purchaseUnit: initial.purchaseUnit ?? '', factor: initial.purchaseFactor, minStock: initial.minStock });

  const factorNum = parseNum(factor);
  const factorBad = !!purchaseUnit && (factorNum === null || Number.isNaN(factorNum) || !isValidFactor(factorNum) || factorNum === 1);
  const minNum = parseNum(minStock);
  const minBad = minNum !== null && (Number.isNaN(minNum) || minNum < 0 || minNum > 1_000_000 || (!isFractionalUnit(base) && !Number.isInteger(minNum)));

  useImperativeHandle(ref, () => ({
    async save() {
      const s = saved.current;
      const minVal = minNum === null || Number.isNaN(minNum) ? null : roundQty(minNum);
      const minChanged = minBad || (minVal || null) !== (s.minStock || null);
      const puChanged = purchasing && (purchaseUnit !== s.purchaseUnit || (!!purchaseUnit && factorNum !== s.factor));
      if (!minChanged && !puChanged) return null;
      if (minChanged && minBad) return { ok: false, error: t.minStockInvalid };
      if (puChanged && purchaseUnit && (factorBad || purchaseUnit === base)) return { ok: false, error: t.factorRequired };
      const r = await setStockSettingsAction({
        productId,
        ...(minChanged ? { minStock: minVal } : {}),
        ...(puChanged ? { purchaseUnit: (purchaseUnit || null) as ProductUnit | null, purchaseFactor: purchaseUnit ? factorNum : null } : {}),
      });
      if (!r.ok) return { ok: false, error: r.error };
      saved.current = {
        purchaseUnit: r.data.product.purchaseUnit ?? '',
        factor: r.data.product.purchaseFactor,
        minStock: r.data.product.minStock,
      };
      return { ok: true };
    },
  }), [productId, purchasing, purchaseUnit, factorNum, factorBad, minNum, minBad, base, t]);

  const puName = purchaseUnit ? units[purchaseUnit as ProductUnit] ?? purchaseUnit : '';
  return (
    <div className="ss-box" role="group" aria-labelledby="ss-title">
      <div className="ss-head">
        <span id="ss-title"><Icon name="settings" size={14} /> {t.title}</span>
        {initial.itemCode && (
          <span className="ss-code" title={t.itemCodeHint}>
            {t.itemCode}: <code>{initial.itemCode}</code>
          </span>
        )}
      </div>

      <div className={purchasing ? 'form-row' : undefined}>
        <div className="auth-field">
          <label htmlFor="ss-min">{tr(t.minStockUnit, { unit: units[base] ?? base })}</label>
          <input
            id="ss-min"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={minStock}
            placeholder={t.minStockPh}
            onChange={(e) => setMinStock(e.target.value.replace(/[^\d.,]/g, ''))}
            aria-invalid={minBad || undefined}
            aria-describedby="ss-min-hint"
            disabled={disabled}
          />
          <span id="ss-min-hint" className="field-hint">{purchasing ? t.minStockHintDaily : t.minStockHint}</span>
        </div>

        {purchasing && (
          <div className="auth-field">
            <label htmlFor="ss-pu">{t.purchaseUnit}</label>
            <div className="ss-pu">
              <select id="ss-pu" value={purchaseUnit} onChange={(e) => setPurchaseUnit(e.target.value)} disabled={disabled}>
                <option value="">{t.purchaseUnitNone}</option>
                {PRODUCT_UNITS.filter((u) => u !== base || u === purchaseUnit).map((u) => <option key={u} value={u}>{units[u]}</option>)}
              </select>
              {purchaseUnit && (
                <input
                  id="ss-factor"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={factor}
                  placeholder={t.factorPh}
                  onChange={(e) => setFactor(e.target.value.replace(/[^\d.,]/g, ''))}
                  aria-label={tr(t.factorLabel, { unit: puName, base: units[base] ?? base })}
                  aria-invalid={factorBad || undefined}
                  disabled={disabled}
                />
              )}
            </div>
            <span className="field-hint" aria-live="polite">
              {purchaseUnit
                ? factorBad
                  ? tr(t.factorLabel, { unit: puName, base: units[base] ?? base })
                  : `${tr(d.production.common.factorLine, { unit: puName, factor: factor, base: units[base] ?? base })} · ${t.copiesHint}`
                : t.hint}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
