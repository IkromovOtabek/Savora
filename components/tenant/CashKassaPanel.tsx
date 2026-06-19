'use client';

import Link from 'next/link';
import { fmtMoney } from '@/lib/format';
import type { BranchCashCard } from '@/lib/cashKassa';

function Card({ c, highlight }: { c: BranchCashCard; highlight?: boolean }) {
  return (
    <div className={`bank-card${highlight ? ' bank-card--total' : ''}`}>
      <div className={highlight ? 'bank-card-title' : 'bank-card-head'}>
        {highlight ? (
          <div className="bank-card-title">{c.name}</div>
        ) : (
          <strong>{c.name}</strong>
        )}
      </div>

      <div className="bank-card-stat">
        <span className="bank-card-stat-label">Naxt sotuv</span>
        <strong className="bank-card-stat-value bank-card-stat-value--green">{fmtMoney(c.naxtSotuv)} UZS</strong>
      </div>

      <div className="bank-card-stat">
        <span className="bank-card-stat-label">Admin olgan</span>
        <strong className="bank-card-stat-value bank-card-stat-value--red">{fmtMoney(c.adminOlgan)} UZS</strong>
      </div>

      <div className="bank-card-stat">
        <span className="bank-card-stat-label">Qolgan</span>
        <strong className="bank-card-stat-value bank-card-stat-value--green">{fmtMoney(c.qolgan)} UZS</strong>
      </div>

      {!highlight && (
        <div className="bank-card-foot">
          <Link href={`/app/kassa/${c.id}`}>Batafsil →</Link>
        </div>
      )}
    </div>
  );
}

export default function CashKassaPanel({
  total,
  cards,
}: {
  total: BranchCashCard;
  cards: BranchCashCard[];
}) {
  return (
    <div className="bank-cards">
      <Card c={total} highlight />
      {cards.map((c) => (
        <Card key={c.id} c={c} />
      ))}
    </div>
  );
}
