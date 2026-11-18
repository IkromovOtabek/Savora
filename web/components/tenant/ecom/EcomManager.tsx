'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons/Icon';
import { setEcomListedAction } from '@/app/actions/ecom';
import { toast } from '@/lib/toast';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import { fmtQty } from '@/lib/qty';
import { useDict } from '@/lib/i18n/client';

export type EcomRow = {
  key: string;
  name: string;
  image?: string;
  price: number;
  maxPrice: number;
  qty: number;
  unit?: string;
  state: 'live' | 'hidden' | 'noPrice';
  listed: boolean;
  manual: boolean;
};

/**
 * Onlayn do'kon ro'yxati: har tovar uchun ko'rsatish/yashirish kaliti, tanlanganlar bilan ommaviy amal.
 * Kalit — aniq tanlov (qo'lda): avtomatik rejim o'chirilsa ham shu holat saqlanadi. «Avtomatik» — tanlovni olib tashlash.
 */
export default function EcomManager({ rows }: { rows: EcomRow[] }) {
  const d = useDict();
  const k = d.ecom.panel;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sel, setSel] = useState<Set<string>>(new Set());
  // Optimistik holat: kalit bosilganda server javobini kutmasdan
  const [over, setOver] = useState<Record<string, boolean>>({});
  useEffect(() => { setOver({}); }, [rows]);

  const run = (keys: string[], mode: 'show' | 'hide' | 'auto', after?: () => void) => start(async () => {
    const r = await setEcomListedAction(keys, mode);
    if (r?.error) {
      toast(r.error, 'error');
      setOver({});
    } else {
      after?.();
      router.refresh();
    }
  });

  const toggle = (row: EcomRow, on: boolean) => {
    setOver((p) => ({ ...p, [row.key]: on }));
    run([row.key], on ? 'show' : 'hide');
  };

  const flip = (key: string) => setSel((p) => {
    const n = new Set(p);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });
  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.key));

  return (
    <>
      <section className="ec-card" aria-label={d.ecom.panel.title}>
        <ul className="ec-list">
          <li className="ec-row" style={{ paddingBlock: 8 }}>
            <input
              type="checkbox"
              aria-label={k.selectAll}
              checked={allOn}
              onChange={() => setSel(allOn ? new Set() : new Set(rows.map((r) => r.key)))}
            />
            <span />
            <span className="ec-muted">{k.col.product}</span>
            <span className="ec-muted">{k.col.show}</span>
            <span className="ec-row-edit" />
          </li>
          {rows.map((row) => {
            const on = over[row.key] ?? row.listed;
            const shown = row.state === 'noPrice' ? 'noPrice' : on && row.qty > 0 ? 'live' : 'hidden';
            return (
              <li key={row.key} className="ec-row">
                <input type="checkbox" aria-label={row.name} checked={sel.has(row.key)} onChange={() => flip(row.key)} />
                {row.image
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img className="ec-thumb" src={row.image} alt="" loading="lazy" />
                  : <span className="ec-thumb" aria-hidden><Icon name="box" size={20} /></span>}
                <span className="ec-row-main">
                  <Link href={`/app/ecom/${row.key}`} className="ec-row-name">{row.name}</Link>
                  <span className="ec-row-sub">
                    {row.state === 'noPrice' ? (
                      <span>{k.noPriceHint}</span>
                    ) : (
                      <span className="t-num">
                        {row.maxPrice > row.price ? tr(k.priceFrom, { price: fmtMoney(row.price) }) : fmtMoney(row.price)} {d.common.sum}
                      </span>
                    )}
                    <span>{k.col.qty}: {fmtQty(row.qty)}{row.unit ? ` ${row.unit}` : ''}</span>
                    <span className={`ec-pill ec-pill--${shown}`}>{k.state[shown]}</span>
                    {row.manual && <span className="ec-tag">{k.choiceManual}</span>}
                  </span>
                </span>
                <label className="ec-switch">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={tr(k.toggleAria, { name: row.name })}
                    checked={row.state !== 'noPrice' && on}
                    disabled={row.state === 'noPrice' || pending}
                    onChange={(e) => toggle(row, e.target.checked)}
                  />
                  <i aria-hidden />
                </label>
                <Link href={`/app/ecom/${row.key}`} className="btn btn-ghost btn-sm ec-row-edit">{k.edit}</Link>
              </li>
            );
          })}
        </ul>
      </section>

      {sel.size > 0 && (
        <div className="ec-bulk" role="toolbar" aria-label={tr(k.selected, { n: sel.size })}>
          <b>{tr(k.selected, { n: sel.size })}</b>
          <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => run([...sel], 'show', () => setSel(new Set()))}>{k.bulkShow}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run([...sel], 'hide', () => setSel(new Set()))}>{k.bulkHide}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run([...sel], 'auto', () => setSel(new Set()))}>{k.bulkAuto}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>{k.clear}</button>
        </div>
      )}
    </>
  );
}
