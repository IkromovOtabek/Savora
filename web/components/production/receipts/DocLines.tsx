'use client';

import { useEffect, useRef } from 'react';
import Icon from '@/components/icons/Icon';
import PriceInput from '@/components/ui/PriceInput';
import { useDict } from '@/lib/i18n/client';
import { qtyWithUnit, tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import { isFractionalUnit } from '@/lib/qty';
import type { ProductUnit } from '@/lib/businessTypes';
import { baseUnitOf, factorOf, lineAmountOf, lineQtyOf, unitChoices, type DocLine } from './lines';

/**
 * Hujjat qatorlari tahriri (kirim akti va xarid buyurtmasi uchun umumiy): miqdor + birlik (asosiy yoki xarid,
 * «1 qop = 50 kg» izohi bilan), narx (huquq bo'lsa), summa, yaroqlilik muddati (faqat kirim).
 * Telefonda har qator — karta, planshet/desktopda — jadval qatori.
 */
export default function DocLines({
  lines,
  onChange,
  onRemove,
  showPrices,
  showExpiry,
  showErrors,
  disabled,
  focusKey,
}: {
  lines: DocLine[];
  onChange: (key: string, part: Partial<DocLine>) => void;
  onRemove: (key: string) => void;
  showPrices: boolean;
  showExpiry: boolean;
  /** Saqlashga urinishdan keyin — yaroqsiz miqdorlar qizil */
  showErrors: boolean;
  disabled?: boolean;
  /** Qo'shilgan/yangilangan qator: qisqa yoritiladi, `focus` — miqdor maydoniga fokus (qo'lda tanlanganda) */
  focusKey?: { key: string; n: number; focus: boolean } | null;
}) {
  const d = useDict();
  const t = d.production.receipts;
  const c = d.production.common;
  const units = d.stock.fields.units;
  const unitName = (u: ProductUnit) => units[u] ?? u;
  const root = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!focusKey) return;
    const el = root.current?.querySelector<HTMLInputElement>(`[data-qty="${focusKey.key}"]`);
    if (!el) return;
    const row = el.closest('li');
    if (row) {
      row.classList.remove('is-flash');
      void row.offsetWidth; // animatsiyani qayta boshlash
      row.classList.add('is-flash');
    }
    if (focusKey.focus) { el.focus(); el.select(); }
    else row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusKey]);

  if (lines.length === 0) {
    return (
      <div className="rc-lines-empty">
        <Icon name="barcode" size={26} />
        <span>{t.addFirst}</span>
      </div>
    );
  }

  const mod = `${showPrices ? '' : ' rc-lines--noprice'}${showExpiry ? '' : ' rc-lines--noexp'}`;
  return (
    <div className={`rc-lines${mod}`}>
      <div className="rc-lines-head" aria-hidden="true">
        <span>{t.colProduct}</span>
        <span>{t.colQty}</span>
        <span className={showPrices ? 'r' : undefined}>{t.colPrice}</span>
        {showPrices && <span className="r">{t.colAmount}</span>}
        {showExpiry && <span className="rc-h-exp">{t.colExpiry}</span>}
        <span />
      </div>
      <ul ref={root} className="rc-lines-list">
        {lines.map((l, i) => {
          const q = lineQtyOf(l);
          const bad = showErrors && !q;
          const choices = unitChoices(l.product);
          const base = baseUnitOf(l.product);
          const factor = factorOf(l);
          const amount = lineAmountOf(l);
          const qid = `rc-q-${l.key}`;
          const pid = `rc-p-${l.key}`;
          const eid = `rc-e-${l.key}`;
          return (
            <li key={l.key} className={`rc-line${bad ? ' is-bad' : ''}`}>
              <div className="rc-line-prod">
                <span className="rc-line-n" aria-hidden="true">{i + 1}</span>
                <span>
                  <b>{l.product.name}</b>
                  <small>
                    {[l.product.code, l.product.available !== null ? tr(t.available, { qty: qtyWithUnit(l.product.available, base, units) }) : null].filter(Boolean).join(' · ')}
                  </small>
                </span>
              </div>

              <div className="rc-line-qty">
                <label className="rc-mini" htmlFor={qid}>{t.colQty}</label>
                <div className="rc-qtyunit">
                  <input
                    id={qid}
                    data-qty={l.key}
                    className="input rc-num"
                    type="text"
                    inputMode={isFractionalUnit(l.unit) ? 'decimal' : 'numeric'}
                    autoComplete="off"
                    value={l.qty}
                    disabled={disabled}
                    aria-invalid={bad || undefined}
                    aria-describedby={factor !== 1 ? `${qid}-f` : undefined}
                    onChange={(e) => onChange(l.key, { qty: e.target.value.replace(/[^\d.,]/g, '') })}
                  />
                  {choices.length > 1 ? (
                    <select
                      className="input rc-unit"
                      value={l.unit}
                      disabled={disabled}
                      aria-label={`${t.colUnit}: ${l.product.name}`}
                      onChange={(e) => onChange(l.key, { unit: e.target.value as ProductUnit })}
                    >
                      {choices.map((u) => <option key={u} value={u}>{unitName(u)}</option>)}
                    </select>
                  ) : (
                    <span className="rc-unit rc-unit--fixed">{unitName(l.unit)}</span>
                  )}
                </div>
                {factor !== 1 && (
                  <small id={`${qid}-f`} className="rc-sub">
                    {tr(c.factorLine, { unit: unitName(l.unit), factor: String(factor).replace('.', ','), base: unitName(base) })}
                    {q ? ` · ${tr(t.baseQty, { qty: qtyWithUnit(q.baseQty, base, units) })}` : ''}
                  </small>
                )}
              </div>

              {showPrices ? (
                <>
                  <div className="rc-line-price">
                    <label className="rc-mini" htmlFor={pid}>{t.colPrice}</label>
                    <PriceInput
                      id={pid}
                      className="input rc-num"
                      value={l.price}
                      onValueChange={(v) => onChange(l.key, { price: v })}
                      disabled={disabled}
                      placeholder="0"
                    />
                  </div>
                  <div className="rc-line-amount">
                    <span className="rc-mini">{t.colAmount}</span>
                    <b className="t-num">{amount !== null ? fmtMoney(amount) : '—'}</b>
                  </div>
                </>
              ) : (
                <div className="rc-line-price">
                  <span className={`rc-tag${l.priced ? ' rc-tag--ok' : ''}`}>{l.priced ? t.priced : t.unpriced}</span>
                </div>
              )}

              {showExpiry && (
                <div className="rc-line-exp">
                  <label className="rc-mini" htmlFor={eid}>{t.colExpiry}</label>
                  <input
                    id={eid}
                    className="input rc-date"
                    type="date"
                    value={l.expiry}
                    disabled={disabled}
                    onChange={(e) => onChange(l.key, { expiry: e.target.value })}
                  />
                </div>
              )}

              <button
                type="button"
                className="rc-del"
                onClick={() => onRemove(l.key)}
                disabled={disabled}
                aria-label={`${t.remove}: ${l.product.name}`}
                title={t.remove}
              >
                <Icon name="trash" size={17} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
