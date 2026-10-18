import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter } from '@/lib/branchScope';
import { buildLedger } from '@/lib/debtLedger';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import BackLink from '@/components/ui/BackLink';
import PrintButton from '@/components/ui/PrintButton';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/clients.css';

export async function generateMetadata() {
  return { title: (await getDict()).crm.customers.act.metaTitle };
}

/** Solishtirish dalolatnomasi — mijoz bilan barcha sotuv va to'lovlar, o'suvchi qoldiq (chop etishga mos) */
export default async function CustomerActPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();
  const { Customer, Sale, user, org } = await getTenantSession();
  const customer = await Customer.findById(id).lean();
  if (!customer) notFound();
  const d = await getDict();
  const a = d.crm.customers.act;

  const sales = await Sale.find({ ...branchFilter(user), customerId: customer._id, status: { $ne: 'cancelled' } })
    .select('saleNo productSnapshot.name createdAt totalAmount payments')
    .sort({ createdAt: 1 })
    .lean();
  const ledger = buildLedger(sales.map((s) => ({
    id: String(s._id),
    saleNo: s.saleNo,
    product: s.productSnapshot?.name ?? '—',
    createdAt: s.createdAt ?? new Date(0),
    totalAmount: s.totalAmount,
    payments: (s.payments ?? []).map((p) => ({ amount: p.amount, paidAt: p.paidAt, note: p.note })),
  })));

  return (
    <div className="cl-page act-page">
      <div className="no-print act-top">
        <BackLink href={`/app/customers/${id}`}>{customer.fullName}</BackLink>
        <PrintButton label={a.print} />
      </div>

      <article className="cl-card act-doc">
        <header className="act-head">
          <div>
            <h1>{a.title}</h1>
            <p>{tr(a.asOf, { date: fmtDate(new Date()) })}</p>
          </div>
          <dl>
            <div><dt>{a.shop}</dt><dd>{org.name}</dd></div>
            <div><dt>{a.customer}</dt><dd>{customer.fullName} · {customer.phone}</dd></div>
          </dl>
        </header>

        {ledger.rows.length === 0 ? (
          <p className="act-empty">{a.empty}</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table act-table">
              <thead>
                <tr>
                  <th>{a.colDate}</th>
                  <th>{a.colDoc}</th>
                  <th className="num">{a.colDebit}</th>
                  <th className="num">{a.colCredit}</th>
                  <th className="num">{a.colBalance}</th>
                </tr>
              </thead>
              <tbody>
                {ledger.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="t-num">{fmtDateTime(r.at)}</td>
                    <td>
                      <b>{r.kind === 'sale' ? a.sale : a.payment}</b> · {r.saleNo}
                      <div className="cell-sub">{r.product}{r.note ? ` · ${r.note}` : ''}</div>
                    </td>
                    <td className="num">{r.debit ? fmtMoney(r.debit) : ''}</td>
                    <td className="num">{r.credit ? fmtMoney(r.credit) : ''}</td>
                    <td className="num"><b>{fmtMoney(r.balance)}</b></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={2}>{a.totals}</th>
                  <th className="num">{fmtMoney(ledger.debit)}</th>
                  <th className="num">{fmtMoney(ledger.credit)}</th>
                  <th className="num">{fmtMoney(ledger.balance)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="act-closing">{a.closing}: <b>{fmtMoney(ledger.balance)} {d.common.sum}</b></p>
        <div className="act-signs">
          <div><span>{a.signShop}</span><i /></div>
          <div><span>{a.signCustomer}</span><i /></div>
        </div>
      </article>
    </div>
  );
}
