import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter, branchAggMatch } from '@/lib/branchScope';
import { PAYMENT_TYPE_LABELS, SALE_STATUS_LABELS, PaymentType, SaleStatus } from '@/lib/models/tenant/Sale';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import OnboardingChecklist from '@/components/tenant/OnboardingChecklist';
import PlanLimitsBanner from '@/components/tenant/PlanLimitsBanner';
import QuickSaleTrigger from '@/components/tenant/QuickSaleTrigger';
import InstallmentAlert, { OverdueInstallment } from '@/components/tenant/InstallmentAlert';
import { computeInstallmentPlan } from '@/lib/installment';
import { dayBoundaries, toDayPoints, smoothPath } from '@/lib/weekBuckets';
import WeekChart from '@/components/tenant/WeekChart';
import Tilt from '@/components/ui/Tilt';
import type { IconName } from '@/components/icons/Icon';
import { loadUserPermissions } from '@/lib/permissionGuard';
import { BUSINESS_TYPES, parseBusinessType } from '@/lib/businessTypes';
import { getLatestReport } from '@/lib/ai/report';
import { parseAiResult } from '@/lib/ai/validate';
import { openTaskFilter, isTaskOverdue } from '@/lib/tasks';
import { BranchPanel, TopProductsPanel, StaffPanel, LowStockPanel, MyTasksPanel } from '@/components/tenant/DashPanels';
import '@/components/tenant/styles/ai.css';

export const metadata = { title: 'Boshqaruv — Savora' };

export default async function TenantDashboard({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; welcome?: string }>;
}) {
  const sp = await searchParams;
  const { user, org, features, Branch, Product, Sale, User, AiReport, Task } = await getTenantSession();

  const perms = await loadUserPermissions(user);
  // AI tavsiya — faqat bugungi keshdan (dashboard ochilganda AI chaqirilmaydi)
  const aiTip = features.ai && perms.has('ai.view')
    ? await getLatestReport({ AiReport }, user, { todayOnly: true }).then((r) => {
        if (!r) return null;
        const res = parseAiResult(r.result);
        const rec = res?.recommendations[0];
        if (rec) return { title: rec.title, detail: rec.detail, source: r.source };
        return res ? { title: 'Bugungi xulosa', detail: res.summary, source: r.source } : null;
      }).catch(() => null)
    : null;
  const bizLabel = BUSINESS_TYPES[parseBusinessType(org.businessType ?? 'general')].label;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Filial login — barcha statistika faqat o'z filiali bo'yicha
  const scope = branchFilter(user);
  const aggScope = branchAggMatch(user);

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
  const monthAgo = new Date(todayStart.getTime() - 30 * 864e5);
  const notCancelled = { status: { $ne: 'cancelled' } };

  // Rolga xos panellar: direktor — filiallar, top mahsulotlar, xodimlar, kam qolgan tovar; xodim — o'z sotuvlari va topshiriqlari
  const [branchAgg, branchList, topAgg, staffAgg, lowStock, myAgg, myTasks] = await Promise.all([
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
          { $match: { createdAt: { $gte: monthAgo }, ...notCancelled } },
          { $group: { _id: '$productSnapshot.name', qty: { $sum: { $ifNull: ['$productSnapshot.saleQuantity', 1] } }, revenue: { $sum: '$totalAmount' } } },
          { $sort: { revenue: -1 } },
          { $limit: 5 },
        ])
      : Promise.resolve([]),
    isAdmin && features.sales
      ? Sale.aggregate<{ _id: string; count: number; total: number }>([
          { $match: { createdAt: { $gte: todayStart }, ...notCancelled } },
          { $group: { _id: '$soldBy', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
          { $sort: { total: -1 } },
          { $limit: 6 },
        ])
      : Promise.resolve([]),
    features.products
      ? Product.find({
          ...scope, trackQuantity: true, status: 'in_stock',
          $expr: { $lte: [{ $subtract: ['$quantity', '$soldQuantity'] }, 3] },
        }).select('name quantity soldQuantity').limit(5).lean()
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
  ]);

  const branchName = new Map(branchList.map((b) => [String(b._id), b.name]));
  const branchRows = branchAgg
    .map((b) => ({ id: String(b._id), name: branchName.get(String(b._id)) ?? 'Filial', today: b.today, week: b.week, count: b.count }))
    .sort((a, b) => b.week - a.week);
  const topRows = topAgg.map((t) => ({ name: t._id || 'Nomsiz', qty: t.qty, revenue: t.revenue }));
  const staffRows = staffAgg.map((r) => ({ name: r._id, count: r.count, total: r.total }));
  const lowRows = lowStock.map((p) => ({ id: String(p._id), name: p.name, left: (p.quantity ?? 0) - (p.soldQuantity ?? 0) }));
  const mine = myAgg[0] ?? { count: 0, total: 0 };
  const taskRows = myTasks.map((t) => ({ id: String(t._id), title: t.title, priority: t.priority, dueDate: t.dueDate, overdue: isTaskOverdue(t) }));

  const week = toDayPoints(weekBounds, weekAgg);
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
  const dateLabel = `${now.getDate()}-${UZ_MONTHS[now.getMonth()]}, ${UZ_WEEKDAYS[now.getDay()]}`;
  const showSaleCta = features.sales && perms.has('sale.create');
  const canAddProduct = features.products && perms.has('product.create');
  const canKassa = features.kassa && perms.has('kassa.view');
  const canReports = features.monitoring && perms.has('reports.view');
  const quickCount = [showSaleCta, canAddProduct, canKassa, canReports].filter(Boolean).length;

  return (
    <div className="t-dash">
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">Xayrli kun, {user.username}</h1>
          <p className="t-page-sub">{dateLabel} · {isAdmin ? 'barcha filiallar' : 'filialingiz'} bo&apos;yicha</p>
        </div>
      </div>

      {sp?.welcome === '1' && (
        <div className="t-note t-note--info">
          Do&apos;koningiz yaratildi! Siz admin sifatida tizimga kirdingiz.
          {' '}{org.plan?.isTrial ? 'Sinov muddati boshlandi.' : org.plan?.tier === 'free' ? 'Bepul tarifda ishlayapsiz.' : ''}
          {' '}Modullar «{bizLabel}» yo&apos;nalishiga mos sozlandi.
        </div>
      )}

      {sp?.module === 'disabled' && (
        <div className="t-note t-note--warn">
          Bu bo&apos;lim o&apos;chirilgan. Platforma egasiga murojaat qiling.
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
            Bugungi tushum
          </div>
          <div className="t-hero-v t-num ux-z">{fmtMoney(todayRevenue)}<small>so&apos;m</small></div>
          <div className="t-hero-foot">
            {revenueDelta !== null ? (
              <span className={`t-hero-delta ${revenueDelta >= 0 ? 'is-up' : 'is-down'}`}>
                <span aria-hidden="true">{revenueDelta >= 0 ? '▲' : '▼'}</span> {Math.abs(revenueDelta)}%
                <span className="t-hero-delta-l"> kechagiga nisbatan</span>
              </span>
            ) : (
              <span className="t-hero-note">{todayRevenue > 0 ? "Kecha tushum bo'lmagan" : "Bugun hali tushum yo'q"}</span>
            )}
            {features.sales && <span className="t-hero-note">7 kun: <b className="t-num">{fmtMoney(weekTotal)}</b> so&apos;m</span>}
          </div>
          {features.sales && weekHasData && <HeroSpark values={week.map((d) => d.total)} />}
        </Tilt>

        <div className="t-stats ux-strip">
          {isAdmin ? (
            <StatCard
              href={features.sales ? '/app/sales' : undefined}
              icon="cart"
              tone=""
              label="Sotuvlar"
              value={String(todaySalesCount)}
              unit="ta"
              sub="bugun, barcha filiallar"
            />
          ) : (
            <StatCard
              href={features.sales ? '/app/sales' : undefined}
              icon="user"
              tone=""
              label="Mening sotuvlarim"
              value={String(mine.count)}
              unit="ta"
              sub={`bugun · ${fmtMoney(mine.total)} so'm`}
            />
          )}
          <StatCard
            href={features.sales ? '/app/debts' : undefined}
            icon="clock"
            tone="gold"
            label="Qarz va nasiya"
            value={fmtMoney(debtTotal)}
            unit="so'm"
            sub="jami qoldiq"
          />
          <StatCard
            href={features.products ? '/app/products' : undefined}
            icon="box"
            tone="gray"
            label="Omborda"
            value={String(inStock)}
            unit="ta"
            sub="sotuvga tayyor mahsulot"
          />
        </div>
      </div>

      {quickCount > 0 && (
        <nav className="t-qa-row" aria-label="Tezkor amallar" data-n={quickCount} style={{ '--qa-n': quickCount } as React.CSSProperties}>
          {showSaleCta && <QuickSaleTrigger />}
          {canAddProduct && (
            <Link href="/app/products/new" className="t-qa">
              <span className="t-qa-ic"><Icon name="box" size={20} /></span>
              <span className="t-qa-t">Mahsulot<small>Omborga qo&apos;shish</small></span>
            </Link>
          )}
          {canKassa && (
            <Link href="/app/kassa" className="t-qa">
              <span className="t-qa-ic"><Icon name="wallet" size={20} /></span>
              <span className="t-qa-t">Kassa<small>Kunlik hisob</small></span>
            </Link>
          )}
          {canReports && (
            <Link href="/app/monitoring" className="t-qa">
              <span className="t-qa-ic"><Icon name="chart" size={20} /></span>
              <span className="t-qa-t">Hisobot<small>Oylik tahlil</small></span>
            </Link>
          )}
        </nav>
      )}

      {aiTip && (
        <Link href="/app/ai" className="t-card ai-dash" aria-label={`AI tavsiya: ${aiTip.title}`}>
          <span className="ai-dash-ic" aria-hidden="true"><Icon name="sparkles" size={20} /></span>
          <span className="ai-dash-t">
            <small>AI tavsiya{aiTip.source === 'rules' ? ' · qoidalar asosida' : ''}</small>
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
              <h2 id="t-week-h">Haftalik tushum</h2>
              {weekHasData && <span className="t-card-meta t-num">{fmtMoney(weekTotal)} so&apos;m</span>}
            </div>
            {weekHasData ? (
              <WeekChart points={week} />
            ) : (
              <div className="ux-empty t-week-empty">
                <span className="ux-empty-ic" aria-hidden="true"><Icon name="chart" size={26} /></span>
                <b>Bu hafta hali tushum yo&apos;q</b>
                <p>Birinchi sotuvdan so&apos;ng bu yerda kunlik tushum grafigi paydo bo&apos;ladi.</p>
                {showSaleCta && <Link href="/app/sales/new" className="t-btn t-btn--filled">Sotuv qilish</Link>}
              </div>
            )}
          </section>
        )}

        <section aria-labelledby="t-recent-h">
          <div className="t-group-head">
            <h2 id="t-recent-h">So&apos;nggi sotuvlar</h2>
            {features.sales && <Link href="/app/sales" className="t-link">Hammasi</Link>}
          </div>
          <div className="t-group">
            {recentSales.length === 0 ? (
              <div className="t-empty">
                <p>Hozircha sotuv yo&apos;q.</p>
                {showSaleCta && <Link href="/app/sales/new" className="t-btn t-btn--filled">Sotuv qilish</Link>}
              </div>
            ) : (
              recentSales.map((s) => (
                <Link key={String(s._id)} href={`/app/sales/${s._id}`} className="t-cell">
                  <span className={`t-sq t-sq--${s.paymentType === 'installment' ? 'gold' : s.status === 'paid' ? 'ok' : 'brand'}`} aria-hidden="true">
                    <Icon name={s.paymentType === 'installment' ? 'clock' : 'cart'} size={16} />
                  </span>
                  <span className="t-cell-t">
                    <b>{s.customerSnapshot?.fullName ?? s.productSnapshot?.name ?? s.saleNo}</b>
                    <small>{s.saleNo} · {PAYMENT_TYPE_LABELS[s.paymentType as PaymentType]} · {fmtDateTime(s.createdAt ?? now)}</small>
                  </span>
                  <span className="t-cell-a">
                    <span className="t-num">{fmtMoney(s.totalAmount)}</span>
                    <span className={`t-pill ${s.status === 'paid' ? 't-pill--ok' : 't-pill--warn'}`}>
                      {SALE_STATUS_LABELS[s.status as SaleStatus]}
                    </span>
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>

      {isAdmin ? (
        <div className="t-panels">
          {features.sales && branchList.length > 1 && <BranchPanel rows={branchRows} />}
          {features.sales && <TopProductsPanel rows={topRows} />}
          {features.sales && <StaffPanel rows={staffRows} />}
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

const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const UZ_WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];

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

