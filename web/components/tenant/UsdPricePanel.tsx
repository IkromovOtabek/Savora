'use client';

import { useState } from 'react';
import { usdToSom } from '@/lib/currencyMath';
import { fmtMoney } from '@/lib/format';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

/**
 * Narxni dollarda kiritish: $ summa × do'kon kursi → so'm, tanlangan narx maydoniga qo'yiladi.
 * Narx bazada doim so'mda saqlanadi (sotuv va kassa so'mda).
 */
export default function UsdPricePanel<K extends string>({ rate, targets, onApply, disabled }: {
  rate: number;
  targets: { key: K; label: string }[];
  onApply: (key: K, som: string) => void;
  disabled?: boolean;
}) {
  const d = useDict();
  const k = d.stock.usd;
  const [usd, setUsd] = useState('');
  const n = Number(usd.replace(',', '.'));
  const som = Number.isFinite(n) && n > 0 ? usdToSom(n, rate) : 0;

  return (
    <div className="st-usd">
      <div className="st-usd-top">
        <label htmlFor="st-usd-in">{k.label}</label>
        <span>{tr(k.rate, { v: fmtMoney(Math.round(rate)) })}</span>
      </div>
      <div className="st-usd-row">
        <div className="st-usd-input">
          <span aria-hidden="true">$</span>
          <input
            id="st-usd-in"
            inputMode="decimal"
            autoComplete="off"
            value={usd}
            onChange={(e) => setUsd(e.target.value.replace(/[^\d.,]/g, '').slice(0, 12))}
            placeholder="0"
            disabled={disabled}
          />
        </div>
        <b className="st-usd-som">{som ? `= ${fmtMoney(som)} ${d.common.sum}` : ''}</b>
      </div>
      <div className="st-usd-btns">
        {targets.map((t) => (
          <button key={t.key} type="button" className="btn btn-sm btn-tinted" disabled={!som || disabled} onClick={() => onApply(t.key, String(som))}>
            {tr(k.apply, { field: t.label })}
          </button>
        ))}
      </div>
    </div>
  );
}
