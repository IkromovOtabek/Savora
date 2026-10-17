import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import { fmtMoney, fmtDate } from '@/lib/format';
import { getDict } from '@/lib/i18n/server';
import { plural, tr } from '@/lib/i18n/fmt';
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
export default async function InstallmentAlert({ items }: { items: OverdueInstallment[] }) {
  if (items.length === 0) return null;
  const d = await getDict();
  return (
    <section className="sl-alert" aria-labelledby="sl-alert-h">
      <div className="sl-alert-head">
        <Icon name="alert" size={18} />
        <strong id="sl-alert-h">{d.sales.installment.alertTitle}</strong>
        <b>{items.length}</b>
      </div>
      <div>
        {items.slice(0, 5).map((it) => (
          <Link key={it.saleId} href={`/app/sales/${it.saleId}`} className="sl-alert-row">
            <span className="sl-alert-name">
              {it.product}
              {it.customer ? ` · ${it.customer}` : ''}
            </span>
            <span className="sl-alert-sub">{tr(plural(it.months, d.sales.nMonthsLate), { n: it.months })} · {fmtDate(it.dueDate)}</span>
            <span className="sl-alert-sum">
              {fmtMoney(it.sum)}
              <small>{d.common.sum}</small>
            </span>
          </Link>
        ))}
      </div>
      {items.length > 5 && (
        <Link href="/app/nasiya" className="sl-alert-more">
          {d.sales.viewAll}
          <Icon name="arrowRight" size={16} />
        </Link>
      )}
    </section>
  );
}
