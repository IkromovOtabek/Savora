import Link from 'next/link';
import type { ReceiptView } from '@/lib/production/receipts';
import type { Dict } from '@/lib/i18n/dict';
import { fmtDate, fmtMoney } from '@/lib/format';
import { qtyWithUnit } from '@/lib/i18n/fmt';
import Icon from '@/components/icons/Icon';

/** Kirim akti — faqat ko'rish (kirim qilingan, bekor qilingan yoki tahrirlash huquqi yo'q) */
export default function ReceiptDoc({ r, d }: { r: ReceiptView; d: Dict }) {
  const t = d.production.receipts;
  const c = d.production.common;
  const units = d.stock.fields.units;
  const prices = r.can.viewPrices;
  const facts: { k: string; label: string; value: React.ReactNode }[] = [
    { k: 'supplier', label: c.supplier, value: r.supplierName ?? t.noSupplier },
    { k: 'branch', label: c.warehouse, value: r.branchName ?? '—' },
    ...(r.supplierInvoiceNo ? [{ k: 'inv', label: t.invoiceNo, value: r.supplierInvoiceNo }] : []),
    ...(r.invoiceDate ? [{ k: 'invd', label: t.invoiceDate, value: fmtDate(r.invoiceDate) }] : []),
    ...(r.purchaseOrderId && r.purchaseOrderNo
      ? [{ k: 'po', label: d.production.common.purchaseOrder, value: <Link href={`/app/purchase-orders/${r.purchaseOrderId}`}>{r.purchaseOrderNo}</Link> }]
      : []),
    ...(r.note ? [{ k: 'note', label: c.note, value: r.note }] : []),
  ];

  return (
    <div className="rc-form">
      {r.status === 'posted' && <p className="rc-note"><Icon name="lock" size={16} /><span>{t.postedNote}</span></p>}
      {r.status === 'draft' && !r.can.edit && <p className="rc-note"><Icon name="lock" size={16} /><span>{t.readOnlyNote}</span></p>}

      <section className="rc-card" aria-label={t.headLabel}>
        <dl className="rc-facts">
          {facts.map((f) => (
            <div key={f.k}><dt>{f.label}</dt><dd>{f.value}</dd></div>
          ))}
        </dl>
      </section>

      <section className="rc-card" aria-labelledby="rc-doc-lines">
        <div className="rc-card-head">
          <h2 id="rc-doc-lines">{t.linesTitle}</h2>
        </div>
        <div className="table-wrap">
          <table className="data-table rc-table">
            <thead>
              <tr>
                <th className="num">№</th>
                <th>{t.colProduct}</th>
                <th className="num">{t.colQty}</th>
                <th className="num">{t.colPrice}</th>
                {prices && <th className="num">{t.colAmount}</th>}
                <th>{t.colExpiry}</th>
              </tr>
            </thead>
            <tbody>
              {r.lines.map((l, i) => (
                <tr key={l.id}>
                  <td className="num">{i + 1}</td>
                  <td><div className="cell-main">{l.name}</div><div className="cell-sub">{l.code}</div></td>
                  <td className="num">
                    {qtyWithUnit(l.qty, l.unit, units)}
                    {l.factor !== 1 && <div className="cell-sub">= {qtyWithUnit(l.baseQty, l.baseUnit, units)}</div>}
                  </td>
                  <td className="num">
                    {prices ? (l.price !== null ? fmtMoney(l.price) : '—') : <span className={`rc-tag${l.priced ? ' rc-tag--ok' : ''}`}>{l.priced ? t.priced : t.unpriced}</span>}
                  </td>
                  {prices && <td className="num"><b>{l.amount !== null ? fmtMoney(l.amount) : '—'}</b></td>}
                  <td>{l.expiryDate ? fmtDate(l.expiryDate) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {prices ? (
          <dl className="rc-totals rc-totals--doc">
            <div className="rc-total-row rc-total-row--main"><dt>{c.total}</dt><dd className="t-num">{fmtMoney(r.total ?? 0)} <small>{d.common.sum}</small></dd></div>
            {r.supplierId && (
              <>
                <div className="rc-total-row"><dt>{t.paidNow}</dt><dd className="t-num">{fmtMoney(r.paidNow ?? 0)} <small>{d.common.sum}</small></dd></div>
                <div className="rc-total-row"><dt>{t.debt}</dt><dd className={`t-num${(r.debt ?? 0) > 0 ? ' rc-c-warn' : ''}`}>{fmtMoney(r.debt ?? 0)} <small>{d.common.sum}</small></dd></div>
              </>
            )}
          </dl>
        ) : (
          <p className="rc-muted rc-doc-hidden">{t.priceHidden}</p>
        )}
      </section>
    </div>
  );
}
