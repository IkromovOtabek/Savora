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
import { dayBoundaries, toDayPoints } from '@/lib/weekBuckets';
import WeekChart from '@/components/tenant/WeekChart';
import { loadUserPermissions } from '@/lib/permissionGuard';
import { BUSINESS_TYPES, parseBusinessType } from '@/lib/businessTypes';

export const metadata = { title: 'Boshqaruv — Savora' };

export default async function TenantDashboard({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; welcome?: string }>;
}) {
  const sp = await searchParams;
  const { user, org, features, Branch, Product, Sale, User } = await getTenantSession();

  const perms = await loadUserPermissions(user);
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
  const week = toDayPoints(weekBounds, weekAgg);
  const weekHasData = week.some((d) => d.total > 0);
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

  return (
    <div className="t-dash">
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">Xayrli kun, {user.username}</h1>
          <p className="t-page-sub">{dateLabel} · {user.role === 'admin' ? 'barcha filiallar' : 'filialingiz'} bo&apos;yicha</p>
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

      <div className="t-kpis">
        <div className="t-kpi">
          <div className="t-kpi-l t-kpi-l--ok"><Icon name="wallet" size={16} />Bugungi tushum</div>
          <div className="t-kpi-v t-num">{fmtMoney(todayRevenue)} <small>so&apos;m</small></div>
          {revenueDelta !== null && (
            <div className={`t-kpi-d ${revenueDelta >= 0 ? 't-up' : 't-down'}`}>
              {revenueDelta >= 0 ? '▲' : '▼'} {Math.abs(revenueDelta)}% kechagiga nisbatan
            </div>
          )}
        </div>
        <div className="t-kpi">
          <div className="t-kpi-l t-kpi-l--brand"><Icon name="cart" size={16} />Sotuvlar soni</div>
          <div className="t-kpi-v t-num">{todaySalesCount} <small>ta bugun</small></div>
        </div>
        <div className="t-kpi">
          <div className="t-kpi-l t-kpi-l--gold"><Icon name="clock" size={16} />Qarz va nasiya qoldig&apos;i</div>
          <div className="t-kpi-v t-num">{fmtMoney(debtTotal)} <small>so&apos;m</small></div>
        </div>
        <div className="t-kpi">
          <div className="t-kpi-l t-kpi-l--muted"><Icon name="box" size={16} />Omborda</div>
          <div className="t-kpi-v t-num">{inStock} <small>ta mahsulot</small></div>
        </div>
      </div>

      <div className="t-quick">
        {showSaleCta && <QuickSaleTrigger />}
        {features.products && perms.has('product.create') && (
          <Link href="/app/products/new" className="quick-action btn-with-icon">
            <Icon name="box" size={22} />
            <span>Mahsulot<small>Omborga qo&apos;shish</small></span>
          </Link>
        )}
        {features.kassa && perms.has('kassa.view') && (
          <Link href="/app/kassa" className="quick-action btn-with-icon">
            <Icon name="wallet" size={22} />
            <span>Kassa<small>Bugungi tushum</small></span>
          </Link>
        )}
      </div>

      <div className={`t-dash-grid${features.sales && weekHasData ? '' : ' t-dash-grid--one'}`}>
        {features.sales && weekHasData && (
          <section className="t-card" aria-labelledby="t-week-h">
            <div className="t-card-head">
              <h2 id="t-week-h">Haftalik tushum</h2>
              <span className="t-card-meta t-num">{fmtMoney(week.reduce((a, d) => a + d.total, 0))} so&apos;m</span>
            </div>
            <WeekChart points={week} />
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
    </div>
  );
}

const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const UZ_WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
