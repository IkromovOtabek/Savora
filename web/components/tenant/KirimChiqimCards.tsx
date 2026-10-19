'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fmtMoney } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import Tilt from '@/components/ui/Tilt';
import { useDict } from '@/lib/i18n/client';
import { qtyByUnits, tr } from '@/lib/i18n/fmt';
import type { QtyByUnit } from '@/lib/unitTotals';
import '@/components/tenant/styles/finance.css';

export interface BranchFlowCard {
  id: string;
  name: string;
  kirimValue: number;
  kirimQty: QtyByUnit;
  chiqimValue: number;
  chiqimQty: QtyByUnit;
  foyda: number;
}

/** Kirim (ombordagi qiymat) va chiqim (sotuv tushumi) — ikki tomonli sarlavha */
export function FlowSplit({
  kirimValue,
  kirimQty,
  chiqimValue,
  chiqimQty,
  foyda,
  kirimLabel,
  chiqimLabel,
}: {
  kirimValue: number;
  kirimQty: QtyByUnit;
  chiqimValue: number;
  chiqimQty: QtyByUnit;
  foyda: number;
  kirimLabel?: string;
  chiqimLabel?: string;
}) {
  const d = useDict();
  const k = d.sales.kirimChiqim;
  const units = d.stock.fields.units;
  return (
    /* 3D-lite: sahifaning asosiy ob'ekti — engil egiladi, ikonkalar hajmli */
    <Tilt as="section" max={3} className="fn-flow">
      <div className="fn-flow-side">
        <span className="fn-flow-label">
          <span className="ux-clay" aria-hidden="true"><Icon name="box" size={15} /></span>
          {kirimLabel ?? k.kirimLabel}
        </span>
        <span className="fn-flow-value fn-num ux-z">{fmtMoney(kirimValue)}<span className="fn-cur">{d.common.sum}</span></span>
        <span className="fn-flow-sub">{tr(k.byCost, { qty: qtyByUnits(kirimQty, units) })}</span>
      </div>
      <div className="fn-flow-side">
        <span className="fn-flow-label">
          <span className="ux-clay ux-clay--green" aria-hidden="true"><Icon name="cart" size={15} /></span>
          {chiqimLabel ?? k.chiqimLabel}
        </span>
        <span className="fn-flow-value fn-num fn-in ux-z">{fmtMoney(chiqimValue)}<span className="fn-cur">{d.common.sum}</span></span>
        <span className="fn-flow-sub">{tr(k.byRevenue, { qty: qtyByUnits(chiqimQty, units) })}</span>
      </div>
      <div className="fn-flow-net">
        <span>{k.netProfit}</span>
        <strong className={foyda >= 0 ? 'fn-in' : 'fn-out'}>{fmtMoney(foyda)} {d.common.sum}</strong>
      </div>
    </Tilt>
  );
}

export default function KirimChiqimCards({ total, cards }: { total: BranchFlowCard; cards: BranchFlowCard[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const d = useDict();
  const k = d.sales.kirimChiqim;

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term) router.push(`/app/products?q=${encodeURIComponent(term)}`);
  }

  // Reyting — sotuv tushumi bo'yicha
  const ranked = [...cards].sort((a, b) => b.chiqimValue - a.chiqimValue);
  const maxSold = Math.max(1, ...ranked.map((c) => c.chiqimValue));

  return (
    <div className="fn-page">
      <FlowSplit {...total} />

      <form className="fn-search" onSubmit={onSearch} role="search">
        <Icon name="search" size={18} />
        <label htmlFor="kc-imei" className="sr-only">
          {k.imeiSearch}
        </label>
        <input
          id="kc-imei"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={k.imeiSearch}
          inputMode="search"
        />
        {q.trim() && <button type="submit" className="btn btn-tinted btn-sm">{k.searchBtn}</button>}
      </form>

      <h2 className="fn-section-title">
        <span>{d.common.branches}</span>
        <span><Link href="/app/kirim-chiqim/all" className="cell-link">{k.allBranchesDetail}</Link></span>
      </h2>

      <div className="fn-panel">
        {ranked.length === 0 ? (
          <div className="ux-empty">
            <span className="ux-empty-ic"><Icon name="store" size={26} /></span>
            <b>{d.sales.noActiveBranch}</b>
            <p>{k.noBranchHint}</p>
          </div>
        ) : (
          <ol className="fn-rank">
            {ranked.map((c) => (
              <li key={c.id} className="fn-rank-item">
                <Link href={`/app/kirim-chiqim/${c.id}`} className="fn-rank-link">
                  <span className="fn-avatar" aria-hidden="true">{c.name.trim().charAt(0).toUpperCase() || '?'}</span>
                  <span className="fn-rank-main">
                    <span className="fn-rank-name">{c.name}</span>
                    <span className="fn-split" aria-hidden="true">
                      <i className="fn-split-in" style={{ width: `${(Math.max(0, c.chiqimValue) / maxSold) * 100}%` }} />
                    </span>
                    <span className="fn-rank-meta">
                      <span>{tr(k.inStockMeta, { sum: fmtMoney(c.kirimValue), qty: qtyByUnits(c.kirimQty, d.stock.fields.units) })}</span>
                      <span>{tr(k.soldMeta, { qty: qtyByUnits(c.chiqimQty, d.stock.fields.units) })}</span>
                    </span>
                  </span>
                  <span className="fn-rank-end">
                    <strong className="fn-in">{fmtMoney(c.chiqimValue)}</strong>
                    <small>{tr(k.profitShort, { sum: fmtMoney(c.foyda) })}</small>
                  </span>
                  <Icon name="chevron" size={16} className="fn-r fn-pass-chev" />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
