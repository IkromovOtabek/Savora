import type { ReceiptPrint } from '@/lib/production/receipts';
import type { Dict } from '@/lib/i18n/dict';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { fmtQty } from '@/lib/qty';
import { qtyWithUnit, tr } from '@/lib/i18n/fmt';

/** Kirim nakladnoyi varag'i (A4): tomonlar, qatorlar, jami/to'lov/qarz, imzolar. Narx yashirin bo'lsa — narx ustunlarisiz */
export default function ReceiptSheet({ v, d }: { v: ReceiptPrint; d: Dict }) {
  const p = d.production.print;
  const t = d.production.receipts;
  const units = d.stock.fields.units;
  // Narx yashirin (kelish narxini ko'rish huquqi yo'q) — narx ustunlari chiqmaydi
  const prices = v.total !== null;
  const showBase = v.lines.some((l) => l.unit !== l.baseUnit && l.baseQty !== l.qty);
  return (
    <article className="rc-sheet" aria-label={p.title}>
      {v.status !== 'posted' && (
        <p className={`rc-sheet-mark${v.status === 'cancelled' ? ' is-off' : ''}`}>{v.status === 'cancelled' ? t.printCancelled : t.printDraft}</p>
      )}
      <header className="rc-sheet-head">
        <div>
          <h1>{p.title}</h1>
          <p className="rc-sheet-no">{tr(t.printNo, { no: v.docNo })}{v.date ? ` · ${fmtDateTime(v.date)}` : ''}</p>
        </div>
        <p className="rc-sheet-shop">{v.shop}</p>
      </header>

      <dl className="rc-sheet-parties">
        <div>
          <dt>{p.shop}</dt>
          <dd>{v.shop}{v.warehouse ? <><br /><small>{p.warehouse}: {v.warehouse}</small></> : null}</dd>
        </div>
        <div>
          <dt>{p.supplier}</dt>
          <dd>
            {v.supplier ? (
              <>
                {v.supplier.name}
                {v.supplier.company && <><br /><small>{v.supplier.company}</small></>}
                {v.supplier.phone && <><br /><small>{t.printPhone}: {v.supplier.phone}</small></>}
              </>
            ) : '—'}
          </dd>
        </div>
        {(v.supplierInvoiceNo || v.invoiceDate) && (
          <div>
            <dt>{p.invoice}</dt>
            <dd>{[v.supplierInvoiceNo, v.invoiceDate ? fmtDate(v.invoiceDate) : null].filter(Boolean).join(' · ')}</dd>
          </div>
        )}
      </dl>

      <table className="rc-sheet-table">
        <thead>
          <tr>
            <th className="num">{p.colNo}</th>
            <th>{p.colName}</th>
            <th>{t.printCode}</th>
            <th className="num">{p.colQty}</th>
            <th>{p.colUnit}</th>
            {showBase && <th className="num">{t.printBase}</th>}
            {prices && <th className="num">{p.colPrice}</th>}
            {prices && <th className="num">{p.colAmount}</th>}
          </tr>
        </thead>
        <tbody>
          {v.lines.map((l) => (
            <tr key={l.n}>
              <td className="num">{l.n}</td>
              <td>{l.name}</td>
              <td className="rc-mono">{l.code}</td>
              <td className="num">{fmtQty(l.qty)}</td>
              <td>{(l.unit && units[l.unit]) || units.dona}</td>
              {showBase && <td className="num">{l.unit !== l.baseUnit ? qtyWithUnit(l.baseQty, l.baseUnit, units) : ''}</td>}
              {prices && <td className="num">{l.price !== null ? fmtMoney(l.price) : '—'}</td>}
              {prices && <td className="num">{l.amount !== null ? fmtMoney(l.amount) : '—'}</td>}
            </tr>
          ))}
        </tbody>
        {prices && v.total !== null && (
          <tfoot>
            <tr>
              <th colSpan={5 + (showBase ? 1 : 0) + 1} className="num">{p.total}</th>
              <th className="num">{fmtMoney(v.total)}</th>
            </tr>
            {v.supplier && v.paid !== null && v.paid > 0 && (
              <tr>
                <td colSpan={5 + (showBase ? 1 : 0) + 1} className="num">{p.paid}</td>
                <td className="num">{fmtMoney(v.paid)}</td>
              </tr>
            )}
            {v.supplier && v.debt !== null && (
              <tr>
                <td colSpan={5 + (showBase ? 1 : 0) + 1} className="num">{p.debt}</td>
                <td className="num">{fmtMoney(v.debt)}</td>
              </tr>
            )}
          </tfoot>
        )}
      </table>

      <div className="rc-sheet-signs">
        <div><span>{p.delivered}</span><i /><small>{t.printSign}</small></div>
        <div><span>{p.received}: {v.receivedBy}</span><i /><small>{t.printSign}</small></div>
      </div>
    </article>
  );
}
