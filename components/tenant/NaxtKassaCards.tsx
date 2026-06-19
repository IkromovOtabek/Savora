import Link from 'next/link';
import { fmtMoney } from '@/lib/format';

export interface KassaCard {
  id: string;
  name: string;
  naxtSotuv: number;
  adminOlgan: number;
  qolgan: number;
}

function Card({ c, highlight }: { c: KassaCard; highlight?: boolean }) {
  return (
    <div className={`kx-card${highlight ? ' kx-card--total' : ''}`}>
      <h3 className="kx-card-title">{c.name}</h3>

      <div className="kx-row">
        <div className="kx-row-head"><span className="kx-label">Naxt sotuv</span></div>
        <div className="kx-value kx-value--in">{fmtMoney(c.naxtSotuv)} UZS</div>
      </div>

      <div className="kx-row">
        <div className="kx-row-head"><span className="kx-label">Admin olgan</span></div>
        <div className="kx-value kx-value--out">{fmtMoney(c.adminOlgan)} UZS</div>
      </div>

      <div className="kx-row kx-row--foyda">
        <span className="kx-label">Qolgan</span>
        <div className="kx-value kx-value--foyda">{fmtMoney(c.qolgan)} UZS</div>
      </div>

      <Link href={highlight ? '/app/sales?type=cash' : `/app/sales?type=cash`} className="kx-link">Batafsil →</Link>
    </div>
  );
}

export default function NaxtKassaCards({ total, cards }: { total: KassaCard; cards: KassaCard[] }) {
  return (
    <div className="kx-grid">
      <Card c={total} highlight />
      {cards.map((c) => <Card key={c.id} c={c} />)}
    </div>
  );
}
