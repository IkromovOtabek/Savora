import Link from 'next/link';
import { fmtMoney } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import Tilt from '@/components/ui/Tilt';
import '@/components/tenant/styles/finance.css';

export interface KassaCard {
  id: string;
  name: string;
  naxtSotuv: number;
  adminOlgan: number;
  qolgan: number;
}

/** Ulush foizi (0–100), nolga bo'linmaydi */
function pct(part: number, whole: number) {
  return whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0;
}

/** Ishorali summa: nol bo'lsa ishorasiz "0" ("−0" / "+0" chiqmaydi) */
function signed(v: number, sign: '+' | '−') {
  return v === 0 ? '0' : `${sign}${fmtMoney(v)}`;
}

function BranchPass({ c }: { c: KassaCard }) {
  return (
    <Link href={`/app/kassa/${c.id}`} className="fn-pass" aria-label={`${c.name} — kunlik naqd to'lovlar`}>
      <div className="fn-pass-head">
        <span className="fn-avatar" aria-hidden="true">{c.name.trim().charAt(0).toUpperCase() || '?'}</span>
        <span className="fn-pass-name">{c.name}</span>
        <Icon name="chevron" size={16} className="fn-pass-chev fn-r" />
      </div>
      <div>
        <div className="fn-pass-label">Kassadagi qoldiq</div>
        <div className="fn-pass-value fn-num">{fmtMoney(c.qolgan)}<span className="fn-cur">so&apos;m</span></div>
      </div>
      <div className="fn-split" aria-hidden="true">
        <i className="fn-split-in" style={{ width: `${pct(c.naxtSotuv - c.adminOlgan, c.naxtSotuv)}%` }} />
        <i className="fn-split-out" style={{ width: `${pct(c.adminOlgan, c.naxtSotuv)}%` }} />
      </div>
      <div className="fn-pass-rows">
        <div className="fn-pass-row"><span>Naqd sotuv</span><strong className={c.naxtSotuv ? 'fn-in' : undefined}>{signed(c.naxtSotuv, '+')}</strong></div>
        <div className="fn-pass-row"><span>Admin olgan</span><strong className={c.adminOlgan ? 'fn-out' : undefined}>{signed(c.adminOlgan, '−')}</strong></div>
      </div>
    </Link>
  );
}

export default function NaxtKassaCards({ total, cards }: { total: KassaCard; cards: KassaCard[] }) {
  return (
    <div className="fn-wallet">
      {/* Hamyon — sahifaning asosiy ob'ekti (3D to'plam) */}
      <Tilt stack as="section" className="fn-hero" style={{ minWidth: 0 }}>
        <div className="fn-hero-top">
          <span className="fn-hero-label">{total.name}</span>
          <span className="fn-emv" aria-hidden="true" />
        </div>
        <div>
          <div className="fn-hero-stat-l">Kassadagi qoldiq</div>
          <div className="fn-hero-value fn-num ux-z">{fmtMoney(total.qolgan)}<span className="fn-cur">so&apos;m</span></div>
        </div>
        <div className="fn-hero-grid">
          <div className="fn-hero-stat">
            <span className="fn-hero-stat-l">Naqd sotuv</span>
            <span className="fn-hero-stat-v fn-num">{signed(total.naxtSotuv, '+')}</span>
          </div>
          <div className="fn-hero-stat">
            <span className="fn-hero-stat-l">Admin olgan</span>
            <span className="fn-hero-stat-v fn-num">{signed(total.adminOlgan, '−')}</span>
          </div>
        </div>
        <Link href="/app/sales?type=cash" className="fn-hero-link">
          Naqd sotuvlar <Icon name="chevron" size={14} className="fn-r" />
        </Link>
      </Tilt>

      <div className="fn-wallet-side">
        {cards.length > 0 && (
          <h2 className="fn-section-title"><span>Filiallar</span><span>{cards.length} ta</span></h2>
        )}

        {cards.length === 0 ? (
          <div className="fn-panel">
            <div className="ux-empty">
              <span className="ux-empty-ic"><Icon name="store" size={26} /></span>
              <b>Faol filial yo&apos;q</b>
              <p>Naqd kassa filiallar bo&apos;yicha yuritiladi. Avval filial qo&apos;shing.</p>
            </div>
          </div>
        ) : (
          <div className="fn-grid">
            {cards.map((c) => <BranchPass key={c.id} c={c} />)}
          </div>
        )}
      </div>
    </div>
  );
}
