import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { parsePeriod, periodRange } from '@/lib/period';
import { bankInOf, loadRealization, sumMoney, type MoneyKind } from '@/lib/realization';
import { amtTone, fmtDateTime, fmtMoney } from '@/lib/format';
import { qtyWithUnit, tr } from '@/lib/i18n/fmt';
import PeriodSeg from '@/components/tenant/PeriodSeg';
import FinanceTabs from '@/components/tenant/FinanceTabs';
import Icon from '@/components/icons/Icon';
import { getDict } from '@/lib/i18n/server';
import '@/components/tenant/styles/clients.css';
import '@/components/tenant/styles/finance.css';

export async function generateMetadata() {
  return { title: (await getDict()).crm.money.realMeta };
}

/** Ekranda ko'rsatiladigan qatorlar (to'liq ro'yxat — Excel faylida) */
const SHOW_LIMIT = 300;

const KIND_ICON: Record<MoneyKind, 'cart' | 'wallet' | 'building' | 'arrowLeft' | 'arrowRight' | 'repeat' | 'box'> = {
  salePay: 'cart',
  debtPay: 'wallet',
  bank: 'building',
  income: 'arrowLeft',
  expense: 'arrowRight',
  refund: 'repeat',
  supplier: 'box',
};

/** Realizatsiya — davrdagi barcha kirim-chiqim va sotilgan tovarlar; Excel yuklab olish (faqat egasi — Moliya layout) */
export default async function RealizationPage({ searchParams }: { searchParams: Promise<{ p?: string; v?: string }> }) {
  const sp = await searchParams;
  const { Sale, CashFlow, BankReceipt, SupplierEntry, Supplier, Branch } = await getTenantSession();
  const d = await getDict();
  const mk = d.crm.money;

  const period = parsePeriod(sp.p, 'month');
  const view = sp.v === 'sales' ? 'sales' : 'money';
  const { start, end } = periodRange(period);
  const { money, sold, branchNames, nasiyaEarlier } = await loadRealization({ Sale, CashFlow, BankReceipt, SupplierEntry, Supplier, Branch }, start, end);
  const sums = sumMoney(money);
  const salesSum = sold.reduce((a, r) => ({ total: a.total + r.total, cost: a.cost + r.cost, profit: a.profit + r.profit }), { total: 0, cost: 0, profit: 0 });
  // Foyda = sotuv foydasi (bank ulushisiz, nasiya — tannarx qoplangach) + oldingi nasiyalarning davrdagi
  // to'lovlaridan foyda + davrda bankdan olingan pul (Hisobot bilan bir qoida)
  const bankIn = bankInOf(money);
  const profit = salesSum.profit + nasiyaEarlier + bankIn;

  const qs = (v: string) => {
    const p = new URLSearchParams();
    if (period !== 'month') p.set('p', period);
    if (v === 'sales') p.set('v', 'sales');
    const s = p.toString();
    return s ? `/app/finance/realization?${s}` : '/app/finance/realization';
  };
  const excelHref = `/api/export/realization?p=${encodeURIComponent(period)}`;
  const rows = view === 'money' ? money : sold;
  const branch = (id?: string) => (id ? branchNames.get(id) ?? '' : '');

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{mk.realTitle}</h1>
          <p className="t-page-sub">{mk.realSub}</p>
        </div>
        <div className="t-page-actions">
          <PeriodSeg basePath={view === 'sales' ? '/app/finance/realization?v=sales' : '/app/finance/realization'} current={period} defaultKey="month" />
          <a href={excelHref} className="btn btn-primary btn-with-icon" download>
            <Icon name="download" size={16} /> {mk.realExcel}
          </a>
        </div>
      </div>
      <FinanceTabs current="real" />

      <div className="fx-sums fx-real-sums">
        <div className="ux-stat"><div className="ux-stat-l">{mk.totalIn}</div><div className="ux-stat-v t-num amt-pos">+ {fmtMoney(sums.in)}</div></div>
        <div className="ux-stat"><div className="ux-stat-l">{mk.totalOut}</div><div className="ux-stat-v t-num amt-neg">− {fmtMoney(sums.out)}</div></div>
        <div className="ux-stat"><div className="ux-stat-l">{mk.net}</div><div className={`ux-stat-v t-num ${amtTone(sums.net)}`}>{fmtMoney(sums.net)}<small>{d.common.sum}</small></div></div>
        <div className="ux-stat"><div className="ux-stat-l">{mk.colProfit}</div><div className={`ux-stat-v t-num ${amtTone(profit)}`}>{fmtMoney(profit)}<small>{d.common.sum}</small></div></div>
      </div>

      <nav className="cl-seg fx-tabs" aria-label={mk.realTitle}>
        <Link href={qs('money')} aria-current={view === 'money' ? 'page' : undefined}>{mk.realTabMoney} <span className="t-num">{money.length}</span></Link>
        <Link href={qs('sales')} aria-current={view === 'sales' ? 'page' : undefined}>{mk.realTabSales} <span className="t-num">{sold.length}</span></Link>
      </nav>

      {rows.length === 0 ? (
        <div className="fx-empty">{view === 'money' ? mk.emptyMoney : mk.emptySales}</div>
      ) : view === 'money' ? (
        <div className="table-wrap fx-card fx-real">
          <table className="data-table">
            <thead>
              <tr>
                <th>{mk.colDate}</th>
                <th>{mk.colKind}</th>
                <th>{mk.colDesc}</th>
                <th>{mk.colBranch}</th>
                <th>{mk.colMethod}</th>
                <th className="num">{mk.colIn}</th>
                <th className="num">{mk.colOut}</th>
              </tr>
            </thead>
            <tbody>
              {money.slice(0, SHOW_LIMIT).map((r, i) => (
                <tr key={i}>
                  <td className="t-num fx-real-date">{fmtDateTime(r.at)}</td>
                  <td><span className="fx-real-kind"><Icon name={KIND_ICON[r.kind]} size={14} /> {mk.kinds[r.kind]}</span></td>
                  <td>
                    {r.href ? <Link href={r.href} className="cell-link"><b>{r.title}</b></Link> : <b>{r.title}</b>}
                    {r.detail && <div className="field-hint">{r.detail}</div>}
                  </td>
                  <td>{branch(r.branchId)}</td>
                  <td>{r.method ? d.sales.payMethods[r.method] : ''}</td>
                  <td className="num t-num amt-pos">{r.amountIn ? `+ ${fmtMoney(r.amountIn)}` : ''}</td>
                  <td className="num t-num amt-neg">{r.amountOut ? `− ${fmtMoney(r.amountOut)}` : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={5}>{mk.net}: <span className={amtTone(sums.net)}>{fmtMoney(sums.net)} {d.common.sum}</span></th>
                <th className="num t-num amt-pos">+ {fmtMoney(sums.in)}</th>
                <th className="num t-num amt-neg">− {fmtMoney(sums.out)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="table-wrap fx-card fx-real">
          <table className="data-table">
            <thead>
              <tr>
                <th>{mk.colDate}</th>
                <th>{mk.colSaleNo}</th>
                <th>{mk.colProduct}</th>
                <th className="num">{mk.colQty}</th>
                <th>{mk.colCustomer}</th>
                <th>{mk.colPayType}</th>
                <th className="num">{mk.colSum}</th>
                <th className="num">{mk.colCost}</th>
                <th className="num">{mk.colProfit}</th>
              </tr>
            </thead>
            <tbody>
              {sold.slice(0, SHOW_LIMIT).map((r) => (
                <tr key={r.saleId}>
                  <td className="t-num fx-real-date">{fmtDateTime(r.at)}</td>
                  <td><Link href={`/app/sales/${r.saleId}`} className="cell-link">{r.saleNo}</Link></td>
                  <td>{r.product}<div className="field-hint">{branch(r.branchId)}</div></td>
                  <td className="num t-num">{qtyWithUnit(r.qty, r.unit, d.stock.fields.units)}</td>
                  <td>{r.customer}</td>
                  <td>{d.sales.paymentTypes[r.paymentType]}</td>
                  <td className="num t-num">{fmtMoney(r.total)}</td>
                  <td className="num t-num">{fmtMoney(r.cost)}</td>
                  <td className={`num t-num ${amtTone(r.profit)}`}>{fmtMoney(r.profit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={6}>{tr(d.common.nPcs, { n: sold.length })}</th>
                <th className="num t-num">{fmtMoney(salesSum.total)}</th>
                <th className="num t-num">{fmtMoney(salesSum.cost)}</th>
                <th className={`num t-num ${amtTone(salesSum.profit)}`}>{fmtMoney(salesSum.profit)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {rows.length > SHOW_LIMIT && <p className="field-hint fx-real-more">{tr(mk.moreRows, { n: SHOW_LIMIT })}</p>}
    </>
  );
}
