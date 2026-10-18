import { getTenantSession } from '@/lib/tenantSession';
import { sumCashFromSales } from '@/lib/cashKassa';
import { fmtMoney } from '@/lib/format';
import { getDict } from '@/lib/i18n/server';
import '@/components/tenant/styles/finance.css';

export async function generateMetadata() {
  return { title: (await getDict()).sales.fin.stateMeta };
}

type Row = { id: string; name: string; cashSales: number; deposits: number; withdrawals: number; cash: number; debtors: number; bank: number };

/** Hisoblar holati — filiallar bo'yicha naqd pul, debitor qarz va bank orqali tushum (BILLZ) */
export default async function FinanceStatePage() {
  const { Branch, Sale, CashFlow } = await getTenantSession();
  const f = (await getDict()).sales.fin;

  const [branches, sales, flows, debtAgg, bankAgg] = await Promise.all([
    Branch.find({ active: true }).select('name').sort({ createdAt: 1 }).lean(),
    Sale.find({ status: { $ne: 'cancelled' } }).select('branchId status paymentType payments returns').lean(),
    CashFlow.aggregate<{ _id: { branchId: unknown; type: string }; total: number }>([
      { $group: { _id: { branchId: '$branchId', type: '$type' }, total: { $sum: '$amount' } } },
    ]),
    Sale.aggregate<{ _id: unknown; total: number }>([
      { $match: { status: 'partial', paymentType: { $in: ['debt', 'installment'] } } },
      { $group: { _id: '$branchId', total: { $sum: '$remainingAmount' } } },
    ]),
    Sale.aggregate<{ _id: unknown; total: number }>([
      { $match: { status: { $ne: 'cancelled' }, paymentType: 'bank_credit' } },
      { $group: { _id: '$branchId', total: { $sum: { $subtract: ['$totalAmount', '$paidAmount'] } } } },
    ]),
  ]);

  const cashByBranch = sumCashFromSales(sales);
  const flow = (id: string | null, type: string) => flows.find((x) => (x._id.branchId ? String(x._id.branchId) : null) === id && x._id.type === type)?.total ?? 0;
  const debt = new Map(debtAgg.map((x) => [String(x._id), x.total]));
  const bank = new Map(bankAgg.map((x) => [String(x._id), x.total]));

  const rows: Row[] = branches.map((b) => {
    const id = String(b._id);
    const cashSales = cashByBranch.get(id) ?? 0;
    const deposits = flow(id, 'income');
    const withdrawals = flow(id, 'expense');
    return { id, name: b.name, cashSales, deposits, withdrawals, cash: cashSales + deposits - withdrawals, debtors: debt.get(id) ?? 0, bank: bank.get(id) ?? 0 };
  });
  const total = rows.reduce((a, r) => ({
    cashSales: a.cashSales + r.cashSales, deposits: a.deposits + r.deposits, withdrawals: a.withdrawals + r.withdrawals,
    cash: a.cash + r.cash, debtors: a.debtors + r.debtors, bank: a.bank + r.bank,
  }), { cashSales: 0, deposits: 0, withdrawals: 0, cash: 0, debtors: 0, bank: 0 });
  const unIn = flow(null, 'income');
  const unOut = flow(null, 'expense');

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{f.stateTitle}</h1>
          <p className="t-page-sub">{f.stateSub}</p>
        </div>
      </div>

      <div className="ux-strip fx-state-strip">
        <div className="ux-stat"><div className="ux-stat-l">{f.colCash}</div><div className="ux-stat-v t-num">{fmtMoney(total.cash)}</div></div>
        <div className="ux-stat"><div className="ux-stat-l">{f.colDebtors}</div><div className="ux-stat-v t-num">{fmtMoney(total.debtors)}</div></div>
        <div className="ux-stat"><div className="ux-stat-l">{f.colBank}</div><div className="ux-stat-v t-num">{fmtMoney(total.bank)}</div></div>
        <div className="ux-stat"><div className="ux-stat-l">{f.unbranched}</div><div className="ux-stat-v t-num">{fmtMoney(unIn - unOut)}</div></div>
      </div>

      <div className="table-wrap fx-card fx-state">
        <table className="data-table">
          <thead>
            <tr>
              <th>{f.colBranch}</th>
              <th className="num">{f.colCashSales}</th>
              <th className="num">{f.colDeposits}</th>
              <th className="num">{f.colWithdrawals}</th>
              <th className="num">{f.colCash}</th>
              <th className="num">{f.colDebtors}</th>
              <th className="num">{f.colBank}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="cell-main">{r.name}</td>
                <td className="num">{fmtMoney(r.cashSales)}</td>
                <td className="num fx-in">+ {fmtMoney(r.deposits)}</td>
                <td className="num fx-out">− {fmtMoney(r.withdrawals)}</td>
                <td className="num"><b>{fmtMoney(r.cash)}</b></td>
                <td className="num">{fmtMoney(r.debtors)}</td>
                <td className="num">{fmtMoney(r.bank)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>{f.total}</th>
              <th className="num">{fmtMoney(total.cashSales)}</th>
              <th className="num">+ {fmtMoney(total.deposits)}</th>
              <th className="num">− {fmtMoney(total.withdrawals)}</th>
              <th className="num">{fmtMoney(total.cash)}</th>
              <th className="num">{fmtMoney(total.debtors)}</th>
              <th className="num">{fmtMoney(total.bank)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
