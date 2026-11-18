import Link from 'next/link';
import type { PoView } from '@/lib/production/purchaseOrders';
import type { ReceiptSummary } from '@/lib/production/receipts';
import type { Dict } from '@/lib/i18n/dict';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { qtyWithUnit, tr } from '@/lib/i18n/fmt';
import Icon from '@/components/icons/Icon';
import StatusPill from '@/components/production/receipts/StatusPill';

/** Buyurtma qatorlari — faqat ko'rish: buyurtma / qabul / qolgan (qator birligida) va qabul chizig'i */
export function PoDocLines({ po, d }: { po: PoView; d: Dict }) {
  const t = d.production.purchase;
  const r = d.production.receipts;
  const units = d.stock.fields.units;
  const prices = po.can.viewPrices;
  return (
    <div className="table-wrap">
      <table className="data-table rc-table">
        <thead>
          <tr>
            <th className="num">№</th>
            <th>{r.colProduct}</th>
            <th className="num">{t.colOrdered}</th>
            <th className="num">{t.colReceived}</th>
            <th className="num">{t.colRemaining}</th>
            {prices && <th className="num">{r.colPrice}</th>}
            {prices && <th className="num">{r.colAmount}</th>}
          </tr>
        </thead>
        <tbody>
          {po.lines.map((l, i) => {
            const pct = l.qty > 0 ? Math.min(100, Math.round((l.receivedQty / l.qty) * 100)) : 0;
            return (
              <tr key={l.id}>
                <td className="num">{i + 1}</td>
                <td>
                  <div className="cell-main">{l.name}</div>
                  <div className="cell-sub">{l.code}{l.factor !== 1 ? ` · ${tr(d.production.common.factorLine, { unit: units[l.unit ?? 'dona'], factor: String(l.factor).replace('.', ','), base: units[l.baseUnit ?? 'dona'] })}` : ''}</div>
                  <span className="rc-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
                </td>
                <td className="num">{qtyWithUnit(l.qty, l.unit, units)}</td>
                <td className="num">{qtyWithUnit(l.receivedQty, l.unit, units)}</td>
                <td className="num"><b className={l.remaining > 0 ? 'rc-c-warn' : 'rc-c-ok'}>{l.remaining > 0 ? qtyWithUnit(l.remaining, l.unit, units) : '✓'}</b></td>
                {prices && <td className="num">{l.price !== null ? fmtMoney(l.price) : '—'}</td>}
                {prices && <td className="num">{l.amount !== null ? fmtMoney(l.amount) : '—'}</td>}
              </tr>
            );
          })}
        </tbody>
        {prices && po.total !== null && (
          <tfoot>
            <tr>
              <th colSpan={6} className="num">{d.production.common.total}</th>
              <th className="num">{fmtMoney(po.total)}</th>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** Buyurtma — faqat ko'rish (qabul boshlangan, yopilgan yoki tahrir huquqi yo'q) */
export default function PoDoc({ po, d }: { po: PoView; d: Dict }) {
  const t = d.production.purchase;
  const c = d.production.common;
  const facts: { k: string; label: string; value: React.ReactNode }[] = [
    { k: 'supplier', label: c.supplier, value: po.supplierName },
    { k: 'branch', label: c.warehouse, value: po.branchName ?? '—' },
    ...(po.expectedAt ? [{ k: 'exp', label: t.expectedAt, value: fmtDate(po.expectedAt) }] : []),
    ...(po.sentAt ? [{ k: 'sent', label: t.send, value: fmtDateTime(po.sentAt) }] : []),
    ...(po.receivedAt ? [{ k: 'rec', label: t.received, value: fmtDateTime(po.receivedAt) }] : []),
    ...(po.note ? [{ k: 'note', label: c.note, value: po.note }] : []),
  ];
  return (
    <div className="rc-form">
      {(po.status === 'draft' || po.status === 'sent') && !po.can.edit && (
        <p className="rc-note"><Icon name="lock" size={16} /><span>{d.production.receipts.readOnlyNote}</span></p>
      )}
      <section className="rc-card" aria-label={d.production.receipts.headLabel}>
        <dl className="rc-facts">
          {facts.map((f) => <div key={f.k}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
        </dl>
      </section>
      <section className="rc-card" aria-labelledby="po-doc-lines">
        <div className="rc-card-head">
          <h2 id="po-doc-lines">{d.production.receipts.linesTitle}</h2>
          <span className="rc-count">{tr(t.progress, { done: po.lines.filter((l) => l.remaining <= 0).length, all: po.lines.length })}</span>
        </div>
        <PoDocLines po={po} d={d} />
      </section>
    </div>
  );
}

/** Shu buyurtma bo'yicha kirim aktlari */
export function PoReceipts({ items, d }: { items: ReceiptSummary[]; d: Dict }) {
  const t = d.production.purchase;
  const r = d.production.receipts;
  return (
    <section className="rc-card" aria-labelledby="po-receipts-h">
      <div className="rc-card-head"><h2 id="po-receipts-h">{t.receiptsTitle}</h2></div>
      {items.length === 0 ? (
        <p className="rc-muted">{t.noReceipts}</p>
      ) : (
        <ul className="rc-docs rc-docs--flat">
          {items.map((x) => (
            <li key={x.id}>
              <Link href={`/app/receipts/${x.id}`} className="rc-doc">
                <span className="rc-doc-top">
                  <span className="rc-doc-no">{x.docNo}</span>
                  <StatusPill kind="receipt" status={x.status} label={d.production.common.receiptStatuses[x.status]} />
                </span>
                <span className="rc-doc-main">
                  <b>{tr(r.linesN, { n: x.lines })}</b>
                  <small>{fmtDateTime(x.postedAt ?? x.createdAt ?? new Date())} · {x.createdBy}</small>
                </span>
                <span className="rc-doc-side">
                  <b className="t-num">{x.total !== null ? <>{fmtMoney(x.total)} <small>{d.common.sum}</small></> : <span className="rc-muted">{r.priceHidden}</span>}</b>
                </span>
                <Icon name="chevron" size={16} className="rc-doc-chev" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
