import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import { fmtMoney, fmtDate } from '@/lib/format';
import './styles/sales.css';

export interface OverdueInstallment {
  saleId: string;
  product: string;
  customer: string | null;
  months: number;
  sum: number;
  dueDate: Date | string;
}

/** Web xabarnoma — muddati o'tgan nasiya to'lovlari (dashboard tepasida). */
export default function InstallmentAlert({ items }: { items: OverdueInstallment[] }) {
  if (items.length === 0) return null;
  return (
    <section className="sl-alert" aria-labelledby="sl-alert-h">
      <div className="sl-alert-head">
        <Icon name="alert" size={18} />
        <strong id="sl-alert-h">Muddati o&apos;tgan nasiya to&apos;lovlari</strong>
        <b>{items.length}</b>
      </div>
      <div>
        {items.slice(0, 5).map((it) => (
          <Link key={it.saleId} href={`/app/sales/${it.saleId}`} className="sl-alert-row">
            <span className="sl-alert-name">
              {it.product}
              {it.customer ? ` · ${it.customer}` : ''}
            </span>
            <span className="sl-alert-sub">{it.months} oy kechikkan · {fmtDate(it.dueDate)}</span>
            <span className="sl-alert-sum">
              {fmtMoney(it.sum)}
              <small>so&apos;m</small>
            </span>
          </Link>
        ))}
      </div>
      {items.length > 5 && (
        <Link href="/app/nasiya" className="sl-alert-more">
          Barchasini ko&apos;rish
          <Icon name="arrowRight" size={16} />
        </Link>
      )}
    </section>
  );
}
