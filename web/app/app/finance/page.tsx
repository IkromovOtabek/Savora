import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { ensureFinanceCategories } from '@/lib/financeCategories';
import { parsePeriod, periodRange } from '@/lib/period';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import { deleteCashFlowAction } from '@/app/actions/finance';
import { FinanceTxForm } from '@/components/tenant/FinanceForms';
import PeriodSeg from '@/components/tenant/PeriodSeg';
import Icon from '@/components/icons/Icon';
import { getDict } from '@/lib/i18n/server';
import '@/components/tenant/styles/finance.css';

export async function generateMetadata() {
  return { title: (await getDict()).sales.fin.txMeta };
}

/** Moliyaviy tranzaksiyalar — BILLZ: chapda jurnal, o'ngda jami va yangi yozuv */
export default async function FinanceTxPage({ searchParams }: { searchParams: Promise<{ p?: string; t?: string }> }) {
  const sp = await searchParams;
  const { CashFlow, Branch, FinanceCategory } = await getTenantSession();
  const d = await getDict();
  const f = d.sales.fin;
  await ensureFinanceCategories(FinanceCategory);

  const period = parsePeriod(sp.p, 'month');
  const type = sp.t === 'income' || sp.t === 'expense' ? sp.t : '';
  const { start, end } = periodRange(period);
  const range = { createdAt: { $gte: start, $lt: end } };

  const [entries, sums, byCat, branches, categories] = await Promise.all([
    CashFlow.find({ ...range, ...(type ? { type } : {}) }).sort({ createdAt: -1 }).limit(300).lean(),
    CashFlow.aggregate<{ _id: 'income' | 'expense'; total: number }>([{ $match: range }, { $group: { _id: '$type', total: { $sum: '$amount' } } }]),
    CashFlow.aggregate<{ _id: { type: string; category: string | null }; total: number }>([
      { $match: range },
      { $group: { _id: { type: '$type', category: '$category' }, total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
      { $limit: 12 },
    ]),
    Branch.find({ active: true }).select('name').sort({ createdAt: 1 }).lean(),
    FinanceCategory.find({ active: true }).select('name type').sort({ name: 1 }).lean(),
  ]);
  const income = sums.find((x) => x._id === 'income')?.total ?? 0;
  const expense = sums.find((x) => x._id === 'expense')?.total ?? 0;
  const branchName = new Map(branches.map((b) => [String(b._id), b.name]));
  const qs = (t: string) => {
    const p = new URLSearchParams();
    if (period !== 'month') p.set('p', period);
    if (t) p.set('t', t);
    const s = p.toString();
    return s ? `/app/finance?${s}` : '/app/finance';
  };

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{f.txTitle}</h1>
          <p className="t-page-sub">{f.txSub}</p>
        </div>
        <PeriodSeg basePath={type ? `/app/finance?t=${type}` : '/app/finance'} current={period} defaultKey="month" />
      </div>

      <div className="t-split">
        <aside className="t-split-rail fx-rail">
          <div className="fx-sums">
            <div className="ux-stat"><div className="ux-stat-l">{f.income}</div><div className="ux-stat-v t-num fx-in">+ {fmtMoney(income)}</div></div>
            <div className="ux-stat"><div className="ux-stat-l">{f.expense}</div><div className="ux-stat-v t-num fx-out">− {fmtMoney(expense)}</div></div>
            <div className="ux-stat"><div className="ux-stat-l">{f.balance}</div><div className="ux-stat-v t-num">{fmtMoney(income - expense)}<small>{d.common.sum}</small></div></div>
          </div>
          {byCat.length > 0 && (
            <section className="fx-card">
              <h2 className="fx-h">{f.byCategory}</h2>
              <ul className="fx-cats">
                {byCat.map((c) => (
                  <li key={`${c._id.type}-${c._id.category ?? ''}`}>
                    <span>{c._id.category || f.noCategory}</span>
                    <b className={`t-num ${c._id.type === 'income' ? 'fx-in' : 'fx-out'}`}>{c._id.type === 'income' ? '+' : '−'} {fmtMoney(c.total)}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="fx-card">
            <FinanceTxForm
              categories={categories.map((c) => ({ name: c.name, type: c.type }))}
              branches={branches.map((b) => ({ id: String(b._id), name: b.name }))}
            />
          </section>
        </aside>

        <div className="t-split-main">
          <nav className="cl-seg fx-tabs" aria-label={f.type}>
            <Link href={qs('')} aria-current={!type ? 'page' : undefined}>{f.all}</Link>
            <Link href={qs('income')} aria-current={type === 'income' ? 'page' : undefined}>{f.income}</Link>
            <Link href={qs('expense')} aria-current={type === 'expense' ? 'page' : undefined}>{f.expense}</Link>
          </nav>
          {entries.length === 0 ? (
            <div className="fx-empty">{f.empty}</div>
          ) : (
            <ul className="fx-list">
              {entries.map((e) => (
                <li key={String(e._id)} className="fx-row">
                  <span className={`fx-ic ${e.type === 'income' ? 'fx-ic--in' : 'fx-ic--out'}`} aria-hidden="true">
                    <Icon name={e.type === 'income' ? 'arrowLeft' : 'arrowRight'} size={16} />
                  </span>
                  <span className="fx-main">
                    <b>{e.description}</b>
                    <small>
                      {e.createdAt ? fmtDateTime(e.createdAt) : ''} · {e.category || f.noCategory}
                      {e.branchId ? ` · ${branchName.get(String(e.branchId)) ?? ''}` : ''} · {e.recordedBy}
                    </small>
                  </span>
                  <b className={`fx-amt t-num ${e.type === 'income' ? 'fx-in' : 'fx-out'}`}>{e.type === 'income' ? '+' : '−'} {fmtMoney(e.amount)}</b>
                  <form action={deleteCashFlowAction}>
                    <input type="hidden" name="entryId" value={String(e._id)} />
                    <button type="submit" className="fx-del" aria-label={`${f.delete}: ${e.description}`}><Icon name="trash" size={15} /></button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
