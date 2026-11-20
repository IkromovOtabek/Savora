'use client';

import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import { fmtMoney } from '@/lib/format';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { shortOrderNo, type BillRow, type BillsSummary } from '@/lib/restaurant/bills';
import type { OrderSummary } from '@/lib/restaurant/view';
import { hhmm, minutesSince } from './shared';

type Dict = ReturnType<typeof useDict>;

/** Hisob nomi: «5-stol» / «Saboy №0042» / «Saboy №0042 · 5-stol» */
export function billTitle(o: Pick<OrderSummary, 'tableNumber' | 'forTableNumber' | 'orderNo'>, d: Dict): string {
  if (o.tableNumber !== null) return tr(d.restaurant.common.tableN, { n: o.tableNumber });
  const no = shortOrderNo(o.orderNo);
  return o.forTableNumber !== null ? tr(d.cashier.takeawayNoFor, { no, n: o.forTableNumber }) : tr(d.cashier.takeawayNo, { no });
}

/** Jamlama: ochiq hisoblar soni, umumiy summa, pre-chek kutayotganlar (va hisob so'raganlar — bo'lsa) */
export function BillsSummaryBar({ summary, compact = false }: { summary: BillsSummary; compact?: boolean }) {
  const d = useDict();
  const k = d.cashier;
  return (
    <dl className={`rt-bsum${compact ? ' rt-bsum--compact' : ''}`} aria-label={k.sumAria}>
      <div><dt>{k.sumOpen}</dt><dd>{summary.count}</dd></div>
      <div data-k="due"><dt>{k.sumDue}</dt><dd>{fmtMoney(summary.due)} <small>{d.common.sum}</small></dd></div>
      <div data-k="precheck" data-on={summary.precheck > 0 || undefined}><dt>{k.sumPrecheck}</dt><dd>{summary.precheck}</dd></div>
      {summary.billRequests > 0 && <div data-k="bill" data-on><dt>{k.sumBillReq}</dt><dd>{summary.billRequests}</dd></div>}
    </dl>
  );
}

/**
 * Ochiq hisoblar ro'yxati (stollar taxtasi «Hisoblar» va kassir navbati): stol yoki saboy, ofitsant, ochilgan vaqt,
 * mehmonlar, to'lanadigan summa, holat; mijoz QR'dan «hisob so'radi» — qizil qator va «Ko'rdim»; stolga bog'langan
 * saboylar — stol ostida. `onSelect` bo'lsa — tanlash tugmasi (kassir), aks holda buyurtma ekraniga havola.
 */
export default function BillsList({ rows, now, label, selectedId, onSelect, canAck, ackingTable, onAck }: {
  rows: readonly BillRow[];
  now: number;
  /** Ro'yxat nomi (ekran o'quvchi) */
  label: string;
  selectedId?: string | null;
  onSelect?: (orderId: string) => void;
  /** order.create yoki order.viewAll — hisob so'rovini «Ko'rdim» */
  canAck: boolean;
  /** «Ko'rdim» yuborilayotgan stol */
  ackingTable: string | null;
  onAck: (tableId: string) => void;
}) {
  const d = useDict();
  const k = d.cashier;

  const main = (o: OrderSummary, kid = false) => {
    const mins = minutesSince(o.openedAt, now);
    const meta = [
      o.waiterName ?? k.noWaiter,
      o.openedAt ? `${tr(k.openedAt, { t: hhmm(o.openedAt) })}${mins !== null ? ` · ${tr(d.restaurant.common.minutes, { n: mins })}` : ''}` : '',
      o.guests ? tr(k.guestsN, { n: o.guests }) : '',
    ].filter(Boolean).join(' · ');
    const pending = o.counts?.pending ?? 0;
    const inner = (
      <>
        <span className="rt-bill-no" aria-hidden="true">
          {o.tableNumber !== null ? o.tableNumber : <Icon name="basket" size={kid ? 18 : 22} />}
        </span>
        <span className="rt-bill-body">
          <b>{billTitle(o, d)}</b>
          <small suppressHydrationWarning>{meta}</small>
          {pending > 0 && <span className="rt-tag rt-tag--qr">{tr(d.restaurant.tables.pendingQrN, { n: pending })}</span>}
        </span>
        <span className="rt-bill-right">
          <b className="rt-bill-sum">{fmtMoney(o.due ?? 0)}</b>
          <span className="rt-pill">{d.restaurant.common.orderStatuses[o.status]}</span>
        </span>
      </>
    );
    const cls = `rt-bill-main${kid ? ' rt-bill-main--kid' : ''}`;
    return onSelect ? (
      <button type="button" className={cls} onClick={() => onSelect(o.id)} aria-current={selectedId === o.id ? 'true' : undefined}>
        {inner}
      </button>
    ) : (
      <Link href={`/app/tables/${o.id}`} className={cls}>{inner}</Link>
    );
  };

  return (
    <ul className="rt-bills" aria-label={label}>
      {rows.map((r) => (
        <li
          key={r.order.id}
          className="rt-bill"
          data-state={r.order.status}
          data-bill={r.billAt ? '' : undefined}
          data-selected={selectedId === r.order.id || undefined}
        >
          {main(r.order)}
          {r.billAt && (
            <div className="rt-bill-call">
              <Icon name="bell" size={15} />
              <span suppressHydrationWarning>{k.billRequested} · {hhmm(r.billAt)}</span>
              {canAck && r.tableId && (
                <button type="button" onClick={() => onAck(r.tableId!)} disabled={ackingTable === r.tableId} aria-label={`${k.ack}: ${billTitle(r.order, d)}`}>
                  {k.ack}
                </button>
              )}
            </div>
          )}
          {r.linked.length > 0 && (
            <ul className="rt-bill-kids" aria-label={tr(k.linkedAria, { n: r.linked.length })}>
              {r.linked.map((x) => (
                <li key={x.id} className="rt-bill-kid" data-state={x.status} data-selected={selectedId === x.id || undefined}>
                  {main(x, true)}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
