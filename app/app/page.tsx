import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter, branchAggMatch } from '@/lib/branchScope';
import { PAYMENT_TYPE_LABELS, SALE_STATUS_LABELS, PaymentType, SaleStatus } from '@/lib/models/tenant/Sale';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import OnboardingChecklist from '@/components/tenant/OnboardingChecklist';
import PlanLimitsBanner from '@/components/tenant/PlanLimitsBanner';
import QuickSaleTrigger from '@/components/tenant/QuickSaleTrigger';

export const metadata = { title: 'Boshqaruv — Savora' };

export default async function TenantDashboard({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; welcome?: string }>;
}) {
  const sp = await searchParams;
  const { user, org, features, Branch, Product, Sale, User } = await getTenantSession();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Filial login — barcha statistika faqat o'z filiali bo'yicha
  const scope = branchFilter(user);
  const aggScope = branchAggMatch(user);

  const [inStock, todaySalesCount, todayRevenueAgg, debtAgg, recentSales, userCount, branchCount, productCount] = await Promise.all([
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
  ]);

  const todayRevenue = todayRevenueAgg[0]?.total ?? 0;
  const debtTotal = debtAgg[0]?.total ?? 0;

  return (
    <>
      <div className="dash-head dash-head--simple">
        <div>
          <h1 className="dash-hello">Salom, {user.username}!</h1>
          <p className="dash-sub">{user.role === 'admin' ? 'Admin' : 'Xodim'} — bugungi natijalar</p>
        </div>
      </div>

      {sp?.welcome === '1' && (
        <div className="auth-alert auth-alert--info" style={{ marginBottom: 16 }}>
          Do&apos;koningiz yaratildi! Siz admin sifatida tizimga kirdingiz — bepul tarifda ishlayapsiz.
        </div>
      )}

      <OnboardingChecklist org={org} features={features} />

      {user.role === 'admin' && (
        <PlanLimitsBanner org={org} current={{ users: userCount, branches: branchCount, products: productCount }} />
      )}

      {sp?.module === 'disabled' && (
        <div className="auth-alert auth-alert--warn" style={{ marginBottom: 16 }}>
          Bu bo&apos;lim o&apos;chirilgan. Platforma egasiga murojaat qiling.
        </div>
      )}

      <div className="quick-actions">
        {features.sales && <QuickSaleTrigger />}
        {features.products && (
          <Link href="/app/products/new" className="quick-action btn-with-icon">
            <Icon name="box" size={22} />
            <span>Mahsulot<small>Omborga qo&apos;shish</small></span>
          </Link>
        )}
        {features.kassa && (
          <Link href="/app/kassa" className="quick-action btn-with-icon">
            <Icon name="wallet" size={22} />
            <span>Kassa<small>Bugungi tushum</small></span>
          </Link>
        )}
      </div>

      <div className="dash-stats">
        <div className="dash-stat dash-stat--ok">
          <div className="dash-stat-n">{todaySalesCount}</div>
          <div className="dash-stat-l">Bugun sotuv</div>
        </div>
        <div className="dash-stat dash-stat--ok">
          <div className="dash-stat-n">{fmtMoney(todayRevenue)}</div>
          <div className="dash-stat-l">Bugun tushum</div>
        </div>
        <div className="dash-stat dash-stat--warn">
          <div className="dash-stat-n">{fmtMoney(debtTotal)}</div>
          <div className="dash-stat-l">Qarz</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-n">{inStock}</div>
          <div className="dash-stat-l">Omborda</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>So&apos;nggi sotuvlar</h2>
          {features.sales && <Link href="/app/sales" className="btn btn-ghost btn-sm">Hammasi</Link>}
        </div>
        {recentSales.length === 0 ? (
          <div className="panel-empty">
            <p>Hozircha sotuv yo&apos;q.</p>
            {features.sales && <Link href="/app/sales/new" className="btn btn-primary">Sotuv qilish</Link>}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table data-table--simple">
              <thead>
                <tr><th>Sotuv</th><th>Mijoz</th><th>Summa</th><th>Holat</th></tr>
              </thead>
              <tbody>
                {recentSales.map((s) => (
                  <tr key={String(s._id)}>
                    <td>
                      <Link href={`/app/sales/${s._id}`} className="cell-link cell-main">{s.saleNo}</Link>
                      <div className="cell-sub">{PAYMENT_TYPE_LABELS[s.paymentType as PaymentType]}</div>
                    </td>
                    <td>{s.customerSnapshot?.fullName ?? '—'}</td>
                    <td>{fmtMoney(s.totalAmount)}</td>
                    <td>
                      <span className={`badge-status badge-status--${s.status === 'paid' ? 'active' : 'suspended'}`}>
                        {SALE_STATUS_LABELS[s.status as SaleStatus]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
