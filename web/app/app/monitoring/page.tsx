import { getTenantSession } from '@/lib/tenantSession';
import { userCan } from '@/lib/permissionGuard';
import { branchFilter, isBranchScoped } from '@/lib/branchScope';
import { monthRange, opexFromFlows } from '@/lib/monitoring';
import { saleProfitRevenue, splitBankReceipts } from '@/lib/bankCredit';
import { earlierNasiyaFilter, loadCostFallback, profitBetween, saleCost, saleProfitParts } from '@/lib/saleProfit';
import Link from 'next/link';
import { PAYMENT_TYPE_LABELS, PaymentType } from '@/lib/models/tenant/Sale';
import { getI18n } from '@/lib/i18n/server';
import { tr, fmtMonthYear } from '@/lib/i18n/fmt';
import { amtTone, fmtMoney } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import MoreMenu from '@/components/ui/MoreMenu';
import MonthNav from '@/components/ui/MonthNav';
import '@/components/tenant/styles/finance.css';

export async function generateMetadata() {
  const { d } = await getI18n();
  return { title: d.shell.monitoring.metaTitle };
}

/** Filial qatori: shu oy sotuvi, sotuvlar soni va foydasi (nasiya va bank qoidalari bilan) */
type BranchRow = { id: string; name: string; revenue: number; count: number; profit: number };

/**
 * Umumiy hisobot — oy natijasi oddiy savollar bilan: qancha sotildi, qancha pul olindi, qancha qarzda qoldi,
 * qancha foyda qoldi va u qanday hisoblandi. Foyda qoidalari: bank krediti ulushi bankdan pul olinganda,
 * nasiya — tannarx to'langach (lib/saleProfit.ts). Xarajatlar (sof foyda) — faqat do'kon egasiga.
 */
export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const [y, m] = (sp.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).split('-').map(Number);
  const { start, end } = monthRange(y, m);

  const { user, Sale, Branch, Product, CashFlow, FinanceCategory, BankReceipt, features } = await getTenantSession();
  const { locale, d } = await getI18n();
  const t = d.shell.monitoring;
  const canExport = features.export && (await userCan(user, 'export.data'));
  // Sof foyda (xarajatlar bilan) — Moliya bo'limi kabi faqat do'kon egasiga: ish haqi, ijara — butun biznes puli
  const showNet = user.role === 'admin' && features.kirimChiqim;

  // Filial login — faqat o'z filiali hisoboti; admin — barcha filiallar
  const scope = branchFilter(user);
  const [sales, branchesAll, flows, financeCategories, bankReceipts, earlierNasiya] = await Promise.all([
    Sale.find({ ...scope, status: { $ne: 'cancelled' }, createdAt: { $gte: start, $lt: end } }).lean(),
    Branch.find({ active: true }).lean(),
    showNet
      ? CashFlow.find({ createdAt: { $gte: start, $lt: end }, category: { $nin: [null, ''] } }).select('type amount category branchId').lean()
      : Promise.resolve([]),
    showNet ? FinanceCategory.find().select('name type system inProfit').lean() : Promise.resolve([]),
    // Bankdan olingan pul — bank krediti ulushi foydaga shu kuni kiradi (pul tushgan filial kassasi bo'yicha)
    BankReceipt.find({ ...scope, receivedAt: { $gte: start, $lt: end } }).select('amount branchId').lean(),
    // Oldin sotilgan nasiyalar — shu oydagi to'lovlari tannarxdan oshgan qismi bilan foydaga kiradi
    Sale.find({ ...scope, ...earlierNasiyaFilter(start, end) })
      .select('branchId productId totalAmount paidAmount remainingAmount paymentType bankName bankParts productSnapshot createdAt payments.amount payments.paidAt returns.refundAmount returns.returnedAt')
      .lean(),
  ]);
  const branches = isBranchScoped(user)
    ? branchesAll.filter((b) => String(b._id) === user.branchId)
    : branchesAll;

  // Tannarx — sotuv paytidagi snapshot; eski sotuvlarda yo'q bo'lsa mahsulotning joriy xarid narxi
  const fallback = await loadCostFallback(Product, [...sales, ...earlierNasiya]);
  const costOf = (sale: Parameters<typeof saleCost>[0]) => saleCost(sale, fallback);

  // Shu oy omborga qo'shilgan mahsulotlar — xarajat emas, faqat izoh (sotilganda tannarxi foydadan ayriladi)
  const incoming = await Product.find({ branchId: { $in: branches.map((b) => b._id) }, createdAt: { $gte: start, $lt: end } })
    .select('quantity trackQuantity purchasePrice').lean();
  let incomingQty = 0;
  let incomingCost = 0;
  for (const p of incoming) {
    const qty = p.trackQuantity ? (p.quantity ?? 1) : 1;
    incomingQty += qty;
    incomingCost += (p.purchasePrice ?? 0) * qty;
  }

  const rows = new Map<string, BranchRow>(branches.map((b) => [String(b._id), { id: String(b._id), name: b.name, revenue: 0, count: 0, profit: 0 }]));
  let revenue = 0;
  let cost = 0;
  let bankShare = 0;
  let salesCount = 0;
  let paid = 0;
  let debt = 0;
  let nasiyaDeferred = 0;
  let nasiyaRecognized = 0;
  const byPayment: Partial<Record<PaymentType, number>> = {};
  for (const sale of sales) {
    const row = rows.get(String(sale.branchId));
    if (!row) continue;
    const c = costOf(sale);
    const own = saleProfitRevenue(sale); // bank ulushisiz
    const parts = saleProfitParts(sale, c);
    row.revenue += sale.totalAmount;
    row.count += 1;
    row.profit += profitBetween(parts, start, end);
    revenue += sale.totalAmount;
    cost += c;
    bankShare += sale.totalAmount - own;
    salesCount += 1;
    paid += sale.paidAmount;
    debt += sale.remainingAmount;
    nasiyaDeferred += own - c - profitBetween(parts, start, end, 'sale');
    nasiyaRecognized += profitBetween(parts, start, end, 'nasiya');
    byPayment[sale.paymentType] = (byPayment[sale.paymentType] ?? 0) + sale.totalAmount;
  }
  for (const sale of earlierNasiya) {
    const row = rows.get(String(sale.branchId));
    if (!row) continue;
    const amount = profitBetween(saleProfitParts(sale, costOf(sale)), start, end);
    row.profit += amount;
    nasiyaRecognized += amount;
  }

  // Bankdan olingan pul — pul tushgan filialga; filialsiz (eski) yoki nofaol filialniki — «filialga bog'lanmagan»
  const bank = splitBankReceipts(bankReceipts, [...rows.keys()]);
  for (const [branchId, amount] of bank.byBranch) {
    const row = rows.get(branchId);
    if (row) row.profit += amount;
  }

  // Xarajatlar va boshqa kirimlar (faqat foydaga kiruvchi toifalar) — filial foydasiga ham
  const opex = opexFromFlows(flows, financeCategories);
  const branchOpex = (id: string) => {
    const o = opex.byBranch.get(id);
    return o ? o.income - o.expense : 0;
  };
  const branchList = [...rows.values()]
    .map((r) => ({ ...r, profit: r.profit + (showNet ? branchOpex(r.id) : 0) }))
    .sort((a, b) => b.revenue - a.revenue || b.profit - a.profit);
  const listedOpex = branchList.reduce((s, b) => s + branchOpex(b.id), 0);
  const restProfit = bank.rest + (showNet ? opex.income - opex.expense - listedOpex : 0);

  // Foyda = sotuv − tannarx − bank ulushi − nasiya kutilayotgan + nasiya to'lovlaridan + bankdan kelgan (+ kirim − xarajat)
  const profit = branchList.reduce((s, b) => s + b.profit, 0) + restProfit;
  const loss = profit < 0;

  const ym = (yy: number, mm: number) => {
    const dt = new Date(yy, mm - 1, 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  };
  const curMonth = ym(y, m);
  const nowMonth = ym(now.getFullYear(), now.getMonth() + 1);
  // Brauzer/Node tiliga bog'liq bo'lmagan yorliq — joriy interfeys tilida
  const monthLabel = fmtMonthYear(new Date(y, m - 1, 1), locale);

  const paymentTypes = (Object.keys(PAYMENT_TYPE_LABELS) as PaymentType[]).filter((pt) => (byPayment[pt] ?? 0) > 0);
  const share = (v: number) => (revenue > 0 ? (v / revenue) * 100 : 0);
  const showBranches = branchList.length > 1 || restProfit !== 0;

  const line = (label: string, value: number, sign: '+' | '−' | '', hint?: string) => (
    <div className="fn-pass-row">
      <span>{label}{hint && <> <small className="fn-pl-hint">({hint})</small></>}</span>
      <strong className={sign === '+' ? 'fn-in' : sign === '−' && value ? 'fn-out' : undefined}>
        {sign && `${sign} `}{fmtMoney(value)}
      </strong>
    </div>
  );

  return (
    <div className="fn-page">
      <div className="t-page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="t-page-title">{t.title}</h1>
          <p className="t-page-sub">{tr(t.subtitle, { month: monthLabel })}</p>
        </div>
        <div className="fn-head-tools">
          <MonthNav value={curMonth} current={nowMonth} href={(v) => `/app/monitoring?month=${v}`} />
          {canExport && (
            <MoreMenu label={d.common.download}>
              <a href="/api/export/sales"><Icon name="download" size={18} /> {t.salesCsv}</a>
              <a href="/api/export/products"><Icon name="download" size={18} /> {t.productsCsv}</a>
            </MoreMenu>
          )}
        </div>
      </div>

      <section className="fx-sums fx-real-sums mon-kpis" aria-label={t.kpiAria} style={{ marginBottom: 0 }}>
        <div className="ux-stat">
          <div className="ux-stat-l">{t.sales}</div>
          <div className="ux-stat-v t-num">{fmtMoney(revenue)}<small>{d.common.sum}</small></div>
          <div className="ux-stat-s">{tr(t.salesSub, { n: salesCount })}</div>
        </div>
        <div className="ux-stat">
          <div className="ux-stat-l">{t.received}</div>
          <div className="ux-stat-v t-num">{fmtMoney(paid)}<small>{d.common.sum}</small></div>
          <div className="ux-stat-s">{t.receivedSub}</div>
        </div>
        <div className="ux-stat">
          <div className="ux-stat-l">{t.debt}</div>
          <div className="ux-stat-v t-num">{fmtMoney(debt)}<small>{d.common.sum}</small></div>
          <div className="ux-stat-s">{t.debtSub}</div>
        </div>
        <div className="ux-stat">
          <div className="ux-stat-l">{loss ? t.loss : t.profit}</div>
          <div className={`ux-stat-v t-num ${amtTone(profit)}`}>{fmtMoney(profit)}<small>{d.common.sum}</small></div>
          <div className="ux-stat-s">{showNet ? t.profitSubNet : t.profitSubGross}</div>
        </div>
      </section>

      <div className="fn-two">
        <section className="fn-panel" aria-labelledby="mon-how">
          <div className="fn-panel-head">
            <h2 id="mon-how">{t.howTitle}</h2>
            <small>{monthLabel}</small>
          </div>
          <div className="fn-panel-body">
            <div className="fn-pass-rows fn-pl">
              {line(t.lSales, revenue, '')}
              {line(t.lCost, cost, '−', t.lCostHint)}
              {bankShare > 0 && line(t.lBankShare, bankShare, '−', t.lBankShareHint)}
              {nasiyaDeferred > 0 && line(t.lNasiyaWait, nasiyaDeferred, '−', t.lNasiyaWaitHint)}
              {nasiyaRecognized !== 0 && line(t.lNasiyaIn, Math.abs(nasiyaRecognized), nasiyaRecognized > 0 ? '+' : '−', t.lNasiyaInHint)}
              {bank.total > 0 && line(t.lBankIn, bank.total, '+')}
              {showNet && opex.income > 0 && line(t.lOtherIncome, opex.income, '+')}
              {showNet && line(t.lExpenses, opex.expense, '−', t.lExpensesHint)}
              <div className="fn-pass-row fn-pl-total">
                <span>{loss ? t.lLoss : t.lResult}</span>
                <strong className={loss ? 'fn-out' : 'fn-in'}>{fmtMoney(profit)} {d.common.sum}</strong>
              </div>
            </div>
            <p className="fn-pl-note">
              {showNet ? (
                <>{t.noteNet} <Link href="/app/finance">{t.addExpense}</Link> · <Link href="/app/finance/categories">{t.categories}</Link></>
              ) : t.noteGross}
            </p>
          </div>
        </section>

        <div className="fn-page" style={{ gap: 16 }}>
          <section className="fn-panel" aria-labelledby="mon-pay">
            <div className="fn-panel-head">
              <h2 id="mon-pay">{t.payTitle}</h2>
            </div>
            <div className="fn-panel-body">
              {paymentTypes.length === 0 ? (
                <p className="fn-pl-note" style={{ margin: 0 }}>{t.noSales}</p>
              ) : (
                <>
                  <div className="fn-mix" aria-hidden="true">
                    {paymentTypes.map((pt) => <i key={pt} className={`fn-c-${pt}`} style={{ width: `${share(byPayment[pt] ?? 0)}%` }} />)}
                  </div>
                  <ul className="fn-mix-list">
                    {paymentTypes.map((pt) => (
                      <li key={pt} className="fn-mix-row">
                        <i className={`fn-c-${pt}`} aria-hidden="true" />
                        <span>{d.shell.paymentTypes[pt] ?? PAYMENT_TYPE_LABELS[pt]}</span>
                        <strong>{fmtMoney(byPayment[pt] ?? 0)}</strong>
                        <small>{Math.round(share(byPayment[pt] ?? 0))}%</small>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>

          {showNet && opex.byCategory.length > 0 && (
            <section className="fn-panel" aria-labelledby="mon-costs">
              <div className="fn-panel-head">
                <h2 id="mon-costs">{t.costsTitle}</h2>
              </div>
              <div className="fn-panel-body">
                <ul className="fx-cats">
                  {opex.byCategory.map((c) => (
                    <li key={`${c.type}-${c.category}`}>
                      <span>{c.category}</span>
                      <b className={`t-num ${c.type === 'income' ? 'fx-in' : 'fx-out'}`}>{c.type === 'income' ? '+' : '−'} {fmtMoney(c.total)}</b>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>
      </div>

      {showBranches && (
        <section className="fn-panel" aria-labelledby="mon-branches">
          <div className="fn-panel-head">
            <h2 id="mon-branches">{t.branchesTitle}</h2>
            <small>{t.colProfit}</small>
          </div>
          <ul className="fx-list mon-branches">
            {branchList.map((b) => (
              <li key={b.id} className="fx-row fx-row--ro">
                <span className="fn-avatar" aria-hidden="true">{b.name.trim().charAt(0).toUpperCase() || '?'}</span>
                <span className="fx-main">
                  <b>{b.name}</b>
                  <small>{tr(t.branchMeta, { sum: fmtMoney(b.revenue), n: b.count })}</small>
                </span>
                <b className={`fx-amt t-num ${amtTone(b.profit)}`}>{fmtMoney(b.profit)}</b>
              </li>
            ))}
            {restProfit !== 0 && (
              <li className="fx-row fx-row--ro">
                <span className="fn-avatar" aria-hidden="true">·</span>
                <span className="fx-main"><b>{t.unbranched}</b></span>
                <b className={`fx-amt t-num ${amtTone(restProfit)}`}>{fmtMoney(restProfit)}</b>
              </li>
            )}
          </ul>
        </section>
      )}

      {incomingQty > 0 && <p className="fn-pl-note" style={{ margin: 0 }}>{tr(t.incomingNote, { n: incomingQty, sum: fmtMoney(incomingCost) })}</p>}
    </div>
  );
}
