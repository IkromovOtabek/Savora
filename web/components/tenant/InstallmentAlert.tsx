import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import { fmtMoney, fmtDate } from '@/lib/format';

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
    <div className="inst-alert">
      <div className="inst-alert-head">
        <Icon name="alert" size={18} />
        <strong>Muddati o&apos;tgan nasiya to&apos;lovlari ({items.length})</strong>
      </div>
      <div className="inst-alert-list">
        {items.slice(0, 5).map((it) => (
          <Link key={it.saleId} href={`/app/sales/${it.saleId}`} className="inst-alert-row">
            <span className="inst-alert-name">
              {it.product}
              {it.customer ? ` · ${it.customer}` : ''}
            </span>
            <span className="inst-alert-meta">
              {it.months} oy · {fmtMoney(it.sum)} so&apos;m · {fmtDate(it.dueDate)}
            </span>
          </Link>
        ))}
      </div>
      {items.length > 5 && (
        <Link href="/app/nasiya" className="inst-alert-more">Barchasini ko&apos;rish →</Link>
      )}
    </div>
  );
}
