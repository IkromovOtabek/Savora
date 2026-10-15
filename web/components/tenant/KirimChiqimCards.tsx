'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fmtMoney } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import Tilt from '@/components/ui/Tilt';
import '@/components/tenant/styles/finance.css';

export interface BranchFlowCard {
  id: string;
  name: string;
  kirimValue: number;
  kirimCount: number;
  chiqimValue: number;
  chiqimCount: number;
  foyda: number;
}

/** Kirim (ombordagi qiymat) va chiqim (sotuv tushumi) — ikki tomonli sarlavha */
export function FlowSplit({
  kirimValue,
  kirimCount,
  chiqimValue,
  chiqimCount,
  foyda,
  kirimLabel = 'Kirim — omborda',
  chiqimLabel = 'Chiqim — sotilgan',
}: {
  kirimValue: number;
  kirimCount: number;
  chiqimValue: number;
  chiqimCount: number;
  foyda: number;
  kirimLabel?: string;
  chiqimLabel?: string;
}) {
  return (
    /* 3D-lite: sahifaning asosiy ob'ekti — engil egiladi, ikonkalar hajmli */
    <Tilt as="section" max={3} className="fn-flow">
      <div className="fn-flow-side">
        <span className="fn-flow-label">
          <span className="ux-clay" aria-hidden="true"><Icon name="box" size={15} /></span>
          {kirimLabel}
        </span>
        <span className="fn-flow-value fn-num ux-z">{fmtMoney(kirimValue)}<span className="fn-cur">so&apos;m</span></span>
        <span className="fn-flow-sub">{kirimCount} ta · tannarx bo&apos;yicha</span>
      </div>
      <div className="fn-flow-side">
        <span className="fn-flow-label">
          <span className="ux-clay ux-clay--green" aria-hidden="true"><Icon name="cart" size={15} /></span>
          {chiqimLabel}
        </span>
        <span className="fn-flow-value fn-num fn-in ux-z">{fmtMoney(chiqimValue)}<span className="fn-cur">so&apos;m</span></span>
        <span className="fn-flow-sub">{chiqimCount} ta · sotuv tushumi</span>
      </div>
      <div className="fn-flow-net">
        <span>Foyda (sotuv − tannarx)</span>
        <strong className={foyda >= 0 ? 'fn-in' : 'fn-out'}>{fmtMoney(foyda)} so&apos;m</strong>
      </div>
    </Tilt>
  );
}

export default function KirimChiqimCards({ total, cards }: { total: BranchFlowCard; cards: BranchFlowCard[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');

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
          IMEI bo&apos;yicha izlash
        </label>
        <input
          id="kc-imei"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="IMEI bo'yicha izlash"
          inputMode="search"
        />
        {q.trim() && <button type="submit" className="btn btn-tinted btn-sm">Izlash</button>}
      </form>

      <h2 className="fn-section-title">
        <span>Filiallar</span>
        <span><Link href="/app/kirim-chiqim/all" className="cell-link">Barcha filiallar batafsil</Link></span>
      </h2>

      <div className="fn-panel">
        {ranked.length === 0 ? (
          <div className="ux-empty">
            <span className="ux-empty-ic"><Icon name="store" size={26} /></span>
            <b>Faol filial yo&apos;q</b>
            <p>Kirim-chiqim filiallar bo&apos;yicha hisoblanadi.</p>
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
                      <span>Omborda: {fmtMoney(c.kirimValue)} · {c.kirimCount} ta</span>
                      <span>Sotilgan: {c.chiqimCount} ta</span>
                    </span>
                  </span>
                  <span className="fn-rank-end">
                    <strong className="fn-in">{fmtMoney(c.chiqimValue)}</strong>
                    <small>Foyda {fmtMoney(c.foyda)}</small>
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
