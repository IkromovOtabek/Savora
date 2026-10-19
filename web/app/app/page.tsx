import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter, branchAggMatch } from '@/lib/branchScope';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import OnboardingChecklist from '@/components/tenant/OnboardingChecklist';
import PlanLimitsBanner from '@/components/tenant/PlanLimitsBanner';
import QuickSaleTrigger from '@/components/tenant/QuickSaleTrigger';
import InstallmentAlert, { OverdueInstallment } from '@/components/tenant/InstallmentAlert';
import { computeInstallmentPlan } from '@/lib/installment';
import { dayBoundaries, toDayPoints, smoothPath } from '@/lib/weekBuckets';
import WeekChart from '@/components/tenant/WeekChart';
import { parsePeriod, periodRange } from '@/lib/period';
import PeriodSeg from '@/components/tenant/PeriodSeg';
import Tilt from '@/components/ui/Tilt';
import type { IconName } from '@/components/icons/Icon';
import { loadUserPermissions } from '@/lib/permissionGuard';
import { parseBusinessType } from '@/lib/businessTypes';
import { getI18n } from '@/lib/i18n/server';
import { tr, fmtDayMonth, qtyWithUnit, WEEKDAYS, WEEKDAYS_SHORT } from '@/lib/i18n/fmt';
import { getStockQty } from '@/lib/productQuantity';
import { getLatestReport } from '@/lib/ai/report';
import { parseAiResult } from '@/lib/ai/validate';
import { openTaskFilter, isTaskOverdue } from '@/lib/tasks';
import { BranchPanel, TopProductsPanel, StaffPanel, LowStockPanel, MyTasksPanel } from '@/components/tenant/DashPanels';
import '@/components/tenant/styles/ai.css';

export async function generateMetadata() {
  const { d } = await getI18n();
  return { title: d.shell.dash.metaTitle };
}

export default async function TenantDashboard({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; welcome?: string; p?: string }>;
}) {
  const sp = await searchParams;
  const { user, org, features, Branch, Product, Sale, User, AiReport, Task } = await getTenantSession();
  const { locale, d } = await getI18n();
  const t = d.shell.dash;

  const perms = await loadUserPermissions(user);
  // AI tavsiya — faqat bugungi keshdan (dashboard ochilganda AI chaqirilmaydi)
  const aiTip = features.ai && perms.has('ai.view')
    ? await getLatestReport({ AiReport }, user, { todayOnly: true }).then((r) => {
        if (!r) return null;
        const res = parseAiResult(r.result);
        const rec = res?.recommendations[0];
        if (rec) return { title: rec.title, detail: rec.detail, source: r.source };
        return res ? { title: t.aiSummary, detail: res.summary, source: r.source } : null;
      }).catch(() => null)
    : null;
  const bizLabel = d.catalog.businessTypes[parseBusinessType(org.businessType ?? 'general')].label;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Filial login — barcha statistika faqat o'z filiali bo'yicha
  const scope = branchFilter(user);
  const aggScope = branchAggMatch(user);

  // Tanlangan davr (Kecha · Bugun · Hafta · Oy · Yil) — admin panellari va davr ko'rsatkichlari
  const period = parsePeriod(sp?.p);
  const { start: pStart, end: pEnd } = periodRange(period, todayStart);
  const inPeriod = { createdAt: { $gte: pStart, $lt: pEnd } };

  // Haftalik grafik — oxirgi 7 kun, kunlik chegaralar server vaqti bo'yicha (todayStart bilan bir xil)
  const weekBounds = dayBoundaries(todayStart, 7);

  const [inStock, todaySalesCount, todayRevenueAgg, debtAgg, recentSales, userCount, branchCount, productCount, weekAgg] = await Promise.all([
    Product.countDocuments({ ...scope, status: 'in_stock' }),
    Sale.countDocuments({ ...scope, createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' } }),
    Sale.aggregate([
      { $match: { ...aggScope, createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$paidAmount' } } },
    ]),
    Sale.aggregate([{ $match: { ...aggScope, status: 'partial' } }, { $group: { _id: null, total: { $sum: '$remainingAmount' } } }]),
    Sale.find({ ...scope, status: { $ne: 'cancelled' } }).sort({ createdAt: -1 }).limit(5).lean(),
    User.countDocuments({ active: true }),
    Branch.countDocuments({ active: true }),
    Product.countDocuments({ ...scope }),
    features.sales
      ? Sale.aggregate<{ _id: Date; total: number; count: number }>([
          { $match: { ...aggScope, createdAt: { $gte: weekBounds[0], $lt: weekBounds[weekBounds.length - 1] }, status: { $ne: 'cancelled' } } },
          { $bucket: { groupBy: '$createdAt', boundaries: weekBounds, default: 'other', output: { total: { $sum: '$paidAmount' }, count: { $sum: 1 } } } },
        ])
      : Promise.resolve([] as { _id: Date; total: number; count: number }[]),
  ]);
  const isAdmin = user.role === 'admin';
  const notCancelled = { status: { $ne: 'cancelled' } };

  // Rolga xos panellar: direktor — filiallar, top mahsulotlar, xodimlar, kam qolgan tovar; xodim — o'z sotuvlari va topshiriqlari
  const [branchAgg, branchList, topAgg, staffAgg, lowStock, myAgg, myTasks, periodAgg] = await Promise.all([
    isAdmin && features.sales
      ? Sale.aggregate<{ _id: unknown; today: number; week: number; count: number }>([
          { $match: { createdAt: { $gte: weekBounds[0] }, ...notCancelled } },
          { $group: {
            _id: '$branchId',
            today: { $sum: { $cond: [{ $gte: ['$createdAt', todayStart] }, '$paidAmount', 0] } },
            week: { $sum: '$paidAmount' },
            count: { $sum: 1 },
          } },
        ])
      : Promise.resolve([]),
    isAdmin ? Branch.find({ active: true }).select('name').lean() : Promise.resolve([]),
    isAdmin && features.sales
      ? Sale.aggregate<{ _id: string; qty: number; revenue: number }>([
          { $match: { ...inPeriod, ...notCancelled } },
          { $group: { _id: '$productSnapshot.name', qty: { $sum: { $ifNull: ['$productSnapshot.saleQuantity', 1] } }, revenue: { $sum: '$totalAmount' } } },
          { $sort: { revenue: -1 } },
          { $limit: 5 },
        ])
      : Promise.resolve([]),
    isAdmin && features.sales
      ? Sale.aggregate<{ _id: string; count: number; total: number }>([
          { $match: { ...inPeriod, ...notCancelled } },
          { $group: { _id: '$soldBy', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
          { $sort: { total: -1 } },
          { $limit: 6 },
        ])
      : Promise.resolve([]),
    features.products
      ? Product.find({
          ...scope, trackQuantity: true, status: 'in_stock',
          $expr: { $lte: [{ $subtract: ['$quantity', '$soldQuantity'] }, 3] },
        }).select('name quantity soldQuantity trackQuantity status unit').limit(5).lean()
      : Promise.resolve([]),
    !isAdmin && features.sales
      ? Sale.aggregate<{ count: number; total: number }>([
          { $match: { ...aggScope, soldBy: user.username, createdAt: { $gte: todayStart }, ...notCancelled } },
          { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
        ])
      : Promise.resolve([]),
    !isAdmin && features.tasks
      ? Task.find(openTaskFilter(user)).sort({ dueDate: 1, createdAt: -1 }).limit(5).lean().catch(() => [])
      : Promise.resolve([]),
    isAdmin && features.sales
      ? Sale.aggregate<{ revenue: number; count: number; refunds: number }>([
          { $match: { ...inPeriod, ...notCancelled } },
          { $group: { _id: null, revenue: { $sum: '$totalAmount' }, count: { $sum: 1 }, refunds: { $sum: { $sum: { $ifNull: ['$returns.refundAmount', []] } } } } },
        ])
      : Promise.resolve([]),
  ]);
  const pStats = periodAgg[0] ?? { revenue: 0, count: 0, refunds: 0 };

  const branchName = new Map(branchList.map((b) => [String(b._id), b.name]));
  const branchRows = branchAgg
    .map((b) => ({ id: String(b._id), name: branchName.get(String(b._id)) ?? d.common.branch, today: b.today, week: b.week, count: b.count }))
    .sort((a, b) => b.week - a.week);
  const topRows = topAgg.map((r) => ({ name: r._id || t.unnamed, qty: r.qty, revenue: r.revenue }));
  const staffRows = staffAgg.map((r) => ({ name: r._id, count: r.count, total: r.total }));
  const lowRows = lowStock.map((p) => {
    const left = getStockQty(p);
    return { id: String(p._id), name: p.name, left, leftText: qtyWithUnit(left, p.unit, d.stock.fields.units) };
  });
  const mine = myAgg[0] ?? { count: 0, total: 0 };
  const taskRows = myTasks.map((x) => ({ id: String(x._id), title: x.title, priority: x.priority, dueDate: x.dueDate, overdue: isTaskOverdue(x) }));

  // Hafta kuni qisqa nomi — joriy tilda (weekBounds[i] = i-kun boshi)
  const week = toDayPoints(weekBounds, weekAgg).map((p, i) => ({ ...p, label: WEEKDAYS_SHORT[locale][weekBounds[i].getDay()] }));
  const weekHasData = week.some((d) => d.total > 0);
  const weekTotal = week.reduce((a, d) => a + d.total, 0);
  const yesterday = week[week.length - 2]?.total ?? 0;
  const revenueDelta = yesterday > 0 ? Math.round(((todayRevenueAgg[0]?.total ?? 0) / yesterday - 1) * 100) : null;

  const todayRevenue = todayRevenueAgg[0]?.total ?? 0;
  const debtTotal = debtAgg[0]?.total ?? 0;

  // Web xabarnoma — muddati o'tib to'lanmagan nasiya oylari
  const overdueInstallments: OverdueInstallment[] = [];
  if (features.variant || features.nasiya) {
    const now = new Date();
    const insts = await Sale.find({ ...scope, paymentType: 'installment', status: 'partial', remainingAmount: { $gt: 0 } }).limit(200).lean();
    for (const s of insts) {
      const plan = computeInstallmentPlan(s, now);
      if (!plan || plan.overdueCount === 0) continue;
      const overdue = plan.schedule.filter((m) => !m.paid && new Date(m.dueDate).getTime() <= now.getTime());
      overdueInstallments.push({
        saleId: String(s._id),
        product: s.productSnapshot.name,
        customer: s.customerSnapshot?.fullName ?? null,
        months: overdue.length,
        sum: overdue.reduce((a, m) => a + m.amount, 0),
        dueDate: overdue[0].dueDate,
      });
    }
  }

  const now = new Date();
  const dateLabel = `${fmtDayMonth(now, locale)}, ${WEEKDAYS[locale][now.getDay()].toLowerCase()}`;
  const showSaleCta = features.sales && perms.has('sale.create');
  const canAddProduct = features.products && perms.has('product.create');
  const canKassa = features.kassa && perms.has('kassa.view');
  const canReports = features.monitoring && perms.has('reports.view');
  const quickCount = [showSaleCta, canAddProduct, canKassa, canReports].filter(Boolean).length;

  return (
    <div className="t-dash">
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{tr(t.greeting, { name: user.username })}</h1>
          <p className="t-page-sub">{dateLabel} · {isAdmin ? t.scopeAll : t.scopeBranch}</p>
        </div>
      </div>

      {sp?.welcome === '1' && (
        <div className="t-note t-note--info">
          {t.welcome}
          {' '}{org.plan?.isTrial ? t.trialStarted : org.plan?.tier === 'free' ? t.freePlan : ''}
          {' '}{tr(t.modulesTuned, { type: bizLabel })}
        </div>
      )}

      {sp?.module === 'disabled' && (
        <div className="t-note t-note--warn">
          {t.moduleDisabled}
        </div>
      )}

      <div className="t-dash-alerts">
        <InstallmentAlert items={overdueInstallments} />
        {user.role === 'admin' && <OnboardingChecklist org={org} features={features} />}
        {user.role === 'admin' && (
          <PlanLimitsBanner org={org} current={{ users: userCount, branches: branchCount, products: productCount }} />
        )}
      </div>

      {/* Asosiy ob'ekt — bugungi tushum (3D), yonida ixcham ko'rsatkichlar */}
      <div className="t-top">
        <Tilt stack className="t-hero" as="section">
          <div className="t-hero-l">
            <span className="t-hero-ic" aria-hidden="true"><Icon name="wallet" size={18} /></span>
            {t.todayRevenue}
          </div>
          <div className="t-hero-v t-num ux-z">{fmtMoney(todayRevenue)}<small>{d.common.sum}</small></div>
          <div className="t-hero-foot">
            {revenueDelta !== null ? (
              <span className={`t-hero-delta ${revenueDelta >= 0 ? 'is-up' : 'is-down'}`}>
                <span aria-hidden="true">{revenueDelta >= 0 ? '▲' : '▼'}</span> {Math.abs(revenueDelta)}%
                <span className="t-hero-delta-l"> {t.vsYesterday}</span>
              </span>
            ) : (
              <span className="t-hero-note">{todayRevenue > 0 ? t.noRevenueYesterday : t.noRevenueToday}</span>
            )}
            {features.sales && <span className="t-hero-note">{t.weekLabel}: <b className="t-num">{fmtMoney(weekTotal)}</b> {d.common.sum}</span>}
          </div>
          {features.sales && weekHasData && <HeroSpark values={week.map((d) => d.total)} />}
        </Tilt>

        <div className="t-stats ux-strip">
          {isAdmin ? (
            <StatCard
              href={features.sales ? '/app/sales' : undefined}
              icon="cart"
              tone=""
              label={d.common.sales}
              value={String(todaySalesCount)}
              unit={d.common.pcs}
              sub={t.todayAllBranches}
            />
          ) : (
            <StatCard
              href={features.sales ? '/app/sales' : undefined}
              icon="user"
              tone=""
              label={t.mySales}
              value={String(mine.count)}
              unit={d.common.pcs}
              sub={tr(t.todaySum, { sum: fmtMoney(mine.total) })}
            />
          )}
          <StatCard
            href={features.sales ? '/app/debts' : undefined}
            icon="clock"
            tone="gold"
            label={t.debtAndInstallment}
            value={fmtMoney(debtTotal)}
            unit={d.common.sum}
            sub={t.totalRemaining}
          />
          <StatCard
            href={features.products ? '/app/products' : undefined}
            icon="box"
            tone="gray"
            label={t.inStock}
            value={String(inStock)}
            unit={d.common.pcs}
            sub={t.readyForSale}
          />
        </div>
      </div>

      {quickCount > 0 && (
        <nav className="t-qa-row" aria-label={t.quickActions} data-n={quickCount} style={{ '--qa-n': quickCount } as React.CSSProperties}>
          {showSaleCta && <QuickSaleTrigger />}
          {canAddProduct && (
            <Link href="/app/products/new" className="t-qa">
              <span className="t-qa-ic"><Icon name="box" size={20} /></span>
              <span className="t-qa-t">{t.qaProduct}<small>{t.qaProductSub}</small></span>
            </Link>
          )}
          {canKassa && (
            <Link href="/app/kassa" className="t-qa">
              <span className="t-qa-ic"><Icon name="wallet" size={20} /></span>
              <span className="t-qa-t">{t.qaKassa}<small>{t.qaKassaSub}</small></span>
            </Link>
          )}
          {canReports && (
            <Link href="/app/monitoring" className="t-qa">
              <span className="t-qa-ic"><Icon name="chart" size={20} /></span>
              <span className="t-qa-t">{t.qaReport}<small>{t.qaReportSub}</small></span>
            </Link>
          )}
        </nav>
      )}

      {aiTip && (
        <Link href="/app/ai" className="t-card ai-dash" aria-label={`${t.aiTip}: ${aiTip.title}`}>
          <span className="ai-dash-ic" aria-hidden="true"><Icon name="sparkles" size={20} /></span>
          <span className="ai-dash-t">
            <small>{t.aiTip}{aiTip.source === 'rules' ? ` · ${t.aiRules}` : ''}</small>
            <b>{aiTip.title}</b>
            <span>{aiTip.detail}</span>
          </span>
          <Icon name="chevron" size={16} className="t-stat-go" />
        </Link>
      )}

      <div className={`t-dash-grid${features.sales ? '' : ' t-dash-grid--one'}`}>
        {features.sales && (
          <section className="t-card t-week" aria-labelledby="t-week-h">
            <div className="t-card-head">
              <h2 id="t-week-h">{t.weekRevenue}</h2>
              {weekHasData && <span className="t-card-meta t-num">{fmtMoney(weekTotal)} {d.common.sum}</span>}
            </div>
            {weekHasData ? (
              <WeekChart points={week} />
            ) : (
              <div className="ux-empty t-week-empty">
                <span className="ux-empty-ic" aria-hidden="true"><Icon name="chart" size={26} /></span>
                <b>{t.weekEmptyTitle}</b>
                <p>{t.weekEmptyText}</p>
                {showSaleCta && <Link href="/app/sales/new" className="t-btn t-btn--filled">{t.makeSale}</Link>}
              </div>
            )}
          </section>
        )}

        <section aria-labelledby="t-recent-h">
          <div className="t-group-head">
            <h2 id="t-recent-h">{t.recentSales}</h2>
            {features.sales && <Link href="/app/sales" className="t-link">{t.all}</Link>}
          </div>
          <div className="t-group">
            {recentSales.length === 0 ? (
              <div className="t-empty">
                <p>{t.noSalesYet}</p>
                {showSaleCta && <Link href="/app/sales/new" className="t-btn t-btn--filled">{t.makeSale}</Link>}
              </div>
            ) : (
              recentSales.map((s) => (
                <Link key={String(s._id)} href={`/app/sales/${s._id}`} className="t-cell">
                  <span className={`t-sq t-sq--${s.paymentType === 'installment' ? 'gold' : s.status === 'paid' ? 'ok' : 'brand'}`} aria-hidden="true">
                    <Icon name={s.paymentType === 'installment' ? 'clock' : 'cart'} size={16} />
                  </span>
                  <span className="t-cell-t">
                    <b>{s.customerSnapshot?.fullName ?? s.productSnapshot?.name ?? s.saleNo}</b>
                    <small>{s.saleNo} · {d.shell.paymentTypes[s.paymentType] ?? s.paymentType} · {fmtDateTime(s.createdAt ?? now)}</small>
                  </span>
                  <span className="t-cell-a">
                    <span className="t-num">{fmtMoney(s.totalAmount)}</span>
                    <span className={`t-pill ${s.status === 'paid' ? 't-pill--ok' : 't-pill--warn'}`}>
                      {d.shell.saleStatuses[s.status] ?? s.status}
                    </span>
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>

      {isAdmin && features.sales && (
        <section className="t-period" aria-labelledby="t-period-h">
          <div className="t-period-head">
            <h2 id="t-period-h">{t.period.title}</h2>
            <PeriodSeg basePath="/app" current={period} />
          </div>
          <div className="ux-strip t-period-strip">
            <div className="ux-stat"><div className="ux-stat-l">{t.period.revenue}</div><div className="ux-stat-v t-num">{fmtMoney(pStats.revenue)}<small>{d.common.sum}</small></div></div>
            <div className="ux-stat"><div className="ux-stat-l">{t.period.count}</div><div className="ux-stat-v t-num">{pStats.count}</div></div>
            <div className="ux-stat"><div className="ux-stat-l">{t.period.avg}</div><div className="ux-stat-v t-num">{fmtMoney(pStats.count ? Math.round(pStats.revenue / pStats.count) : 0)}<small>{d.common.sum}</small></div></div>
            <div className="ux-stat"><div className="ux-stat-l">{t.period.refunds}</div><div className="ux-stat-v t-num">{fmtMoney(pStats.refunds)}<small>{d.common.sum}</small></div></div>
          </div>
        </section>
      )}

      {isAdmin ? (
        <div className="t-panels">
          {features.sales && branchList.length > 1 && <BranchPanel rows={branchRows} />}
          {features.sales && <TopProductsPanel rows={topRows} meta={t.period[period]} />}
          {features.sales && <StaffPanel rows={staffRows} meta={t.period[period]} />}
          {features.products && <LowStockPanel rows={lowRows} />}
        </div>
      ) : (
        (features.tasks || lowRows.length > 0) && (
          <div className="t-panels">
            {features.tasks && <MyTasksPanel rows={taskRows} />}
            {features.products && lowRows.length > 0 && <LowStockPanel rows={lowRows} />}
          </div>
        )
      )}
    </div>
  );
}

/** Ixcham ko'rsatkich kartasi (tekis, 3D emas — faqat hajmli ikonka). Havola bo'lsa butun karta bosiladi. */
function StatCard({
  href, icon, tone, label, value, unit, sub,
}: { href?: string; icon: IconName; tone: '' | 'gold' | 'green' | 'red' | 'gray'; label: string; value: string; unit: string; sub: string }) {
  const body = (
    <>
      <span className={`ux-clay${tone ? ` ux-clay--${tone}` : ''}`} aria-hidden="true"><Icon name={icon} size={20} /></span>
      <span className="t-stat-t">
        <span className="ux-stat-l">{label}</span>
        <span className="ux-stat-v">{value}<small>{unit}</small></span>
        <span className="ux-stat-s">{sub}</span>
      </span>
      {href && <Icon name="chevron" size={16} className="t-stat-go" />}
    </>
  );
  return href
    ? <Link href={href} className="ux-stat t-stat">{body}</Link>
    : <div className="ux-stat t-stat">{body}</div>;
}

/** Hero kartadagi 7 kunlik mini-chiziq (faqat bezak — qiymatlar grafikda va matnda bor). */
function HeroSpark({ values }: { values: number[] }) {
  const W = 220;
  const H = 56;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [4 + (i * (W - 8)) / (values.length - 1), 6 + (H - 12) * (1 - v / max)] as [number, number]);
  const line = smoothPath(pts);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg className="t-hero-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMaxYMax meet" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="t-spark-a" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".38" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W - 4},${H} L4,${H} Z`} fill="url(#t-spark-a)" />
      <path d={line} className="t-hero-spark-l" />
      <circle cx={lx} cy={ly} r={4} className="t-hero-spark-d" />
    </svg>
  );
}

