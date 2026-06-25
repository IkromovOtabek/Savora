'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fmtMoney } from '@/lib/format';
import Icon from '@/components/icons/Icon';

export interface BranchFlowCard {
  id: string;
  name: string;
  kirimValue: number;
  kirimCount: number;
  chiqimValue: number;
  chiqimCount: number;
  foyda: number;
}

function Card({ c, highlight }: { c: BranchFlowCard; highlight?: boolean }) {
  return (
    <div className={`kx-card${highlight ? ' kx-card--total' : ''}`}>
      <h3 className="kx-card-title">{c.name}</h3>

      <div className="kx-row">
        <div className="kx-row-head">
          <span className="kx-label">Kirim (ombordagi)</span>
          {c.kirimCount > 0 && <span className="kx-badge kx-badge--in">{c.kirimCount} ta</span>}
        </div>
        <div className="kx-value kx-value--in">{fmtMoney(c.kirimValue)} UZS</div>
      </div>

      <div className="kx-row">
        <div className="kx-row-head">
          <span className="kx-label">Chiqim (sotilgan)</span>
          {c.chiqimCount > 0 && <span className="kx-badge kx-badge--out">{c.chiqimCount} ta</span>}
        </div>
        <div className="kx-value kx-value--out">{fmtMoney(c.chiqimValue)} UZS</div>
      </div>

      <div className="kx-row kx-row--foyda">
        <span className="kx-label">Foyda</span>
        <div className="kx-value kx-value--foyda">{fmtMoney(c.foyda)} UZS</div>
      </div>

      {!highlight && (
        <Link href={`/app/kirim-chiqim/${c.id}`} className="kx-link">Batafsil →</Link>
      )}
      {highlight && (
        <Link href="/app/kirim-chiqim/all" className="kx-link">Batafsil →</Link>
      )}
    </div>
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

  return (
    <>
      <form className="kx-search" onSubmit={onSearch}>
        <Icon name="search" size={18} className="kx-search-icon" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="IMEI bo'yicha izlash"
          className="kx-search-input"
        />
      </form>

      <div className="kx-grid">
        <Card c={total} highlight />
        {cards.map((c) => <Card key={c.id} c={c} />)}
      </div>
    </>
  );
}
