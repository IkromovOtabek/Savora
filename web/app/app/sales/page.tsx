import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter, branchAggMatch } from '@/lib/branchScope';
import { PAYMENT_TYPE_LABELS, SALE_STATUS_LABELS, PaymentType, SaleStatus } from '@/lib/models/tenant/Sale';
import { fmtDate, fmtMoney } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import MoreMenu from '@/components/ui/MoreMenu';
import Tilt from '@/components/ui/Tilt';
import { loadUserPermissions } from '@/lib/permissionGuard';

export const metadata = { title: 'Sotuvlar — Savora' };

/** Ro'yxatdagi qisqa to'lov turi yorliqlari (yagona atamalar) */
const TYPE_SHORT: Record<PaymentType, string> = {
  cash: 'Naqd',
  debt: 'Qarz',
  installment: 'Nasiya',
  bank_credit: 'Bank krediti',
};

/** `short` — mobilda segment kesilmasligi uchun qisqa yorliq */
const STATUS_SEG: { key?: SaleStatus; label: string; short?: string }[] = [
  { label: 'Barchasi' },
  { key: 'paid', label: "To'langan" },
  { key: 'partial', label: 'Qarzdor' },
  { key: 'cancelled', label: 'Bekor qilingan', short: 'Bekor' },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

type SumRow = { n: number; sum: number };

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const { user, Sale, Product, Branch, features } = await getTenantSession();

  const perms = await loadUserPermissions(user);
  const canViewCost = perms.has('product.viewCost');
  const scope = branchFilter(user);
  const filter: Record<string, unknown> = { ...scope };
  if (sp.status && sp.status in SALE_STATUS_LABELS) filter.status = sp.status;
  if (sp.type && sp.type in PAYMENT_TYPE_LABELS) filter.paymentType = sp.type;
  const activeStatus = filter.status as SaleStatus | undefined;
  const activeType = filter.paymentType as PaymentType | undefined;

  const sales = await Sale.find(filter).sort({ createdAt: -1 }).limit(200).lean();

  // Boyitish uchun mahsulot va filial ma'lumotlari
  const productIds = [...new Set(sales.map((s) => String(s.productId)))];
  const [products, branches] = await Promise.all([
    Product.find({ _id: { $in: productIds } }).lean(),
    Branch.find().lean(),
  ]);
  const productMap = Object.fromEntries(products.map((p) => [String(p._id), p]));
  const branchMap = Object.fromEntries(branches.map((b) => [String(b._id), b.name]));

  const rows = sales.map((s) => {
    const prod = productMap[String(s.productId)];
    const qty = s.productSnapshot.saleQuantity ?? 1;
    const unit = qty > 0 ? Math.round(s.totalAmount / qty) : s.totalAmount;
    const cancelled = s.status === 'cancelled';
    const color = prod?.color || '';
    const note = prod?.notes || s.notes || '';
    const customer = s.customerSnapshot?.fullName || '';
    const name = prod?.deviceModel || prod?.name || s.productSnapshot.name;
    return {
      id: String(s._id),
      saleNo: s.saleNo,
      name,
      color,
      qty,
      source: branchMap[String(s.branchId)] ?? '—',
      imei: s.productSnapshot.imei,
      purchase: s.productSnapshot.purchasePrice ?? prod?.purchasePrice ?? 0,
      unit,
      total: s.totalAmount,
      remaining: s.remainingAmount,
      type: s.paymentType as PaymentType,
      note,
      customer,
      avatar: initials(customer || name),
      date: fmtDate(s.createdAt!),
      cancelled,
    };
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  const todaySales = await Sale.countDocuments({ ...scope, createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' } });
  const debtTotal = await Sale.aggregate([
    { $match: { ...branchAggMatch(user), status: 'partial' } },
    { $group: { _id: null, total: { $sum: '$remainingAmount' } } },
  ]);

  // Xulosa paneli: bugun / 7 kun / jami va to'lov turlari bo'yicha sonlar (bitta aggregate, filial chegarasi bilan)
  const sumGroup = { $group: { _id: null, n: { $sum: 1 }, sum: { $sum: '$totalAmount' } } };
  const [summary] = await Sale.aggregate<{
    byType: { _id: PaymentType; n: number }[];
    all: SumRow[];
    week: SumRow[];
    today: SumRow[];
  }>([
    { $match: { ...branchAggMatch(user), status: { $ne: 'cancelled' } } },
    {
      $facet: {
        byType: [{ $group: { _id: '$paymentType', n: { $sum: 1 } } }],
        all: [sumGroup],
        week: [{ $match: { createdAt: { $gte: weekStart } } }, sumGroup],
        today: [{ $match: { createdAt: { $gte: todayStart } } }, sumGroup],
      },
    },
  ]);
  const typeCount = Object.fromEntries((summary?.byType ?? []).map((t) => [t._id, t.n])) as Partial<Record<PaymentType, number>>;
  const all = summary?.all[0] ?? { n: 0, sum: 0 };
  const week = summary?.week[0] ?? { n: 0, sum: 0 };
  const today = summary?.today[0] ?? { n: 0, sum: 0 };

  const typeChips: PaymentType[] = (['cash', 'debt', 'installment', 'bank_credit'] as PaymentType[]).filter((t) => {
    if (t === 'installment') return features.nasiya || features.variant;
    if (t === 'bank_credit') return features.creditKassa;
    return true;
  });

  const href = (status?: string, type?: string) => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (type) q.set('type', type);
    const s = q.toString();
    return s ? `/app/sales?${s}` : '/app/sales';
  };
  const filtered = !!(activeStatus || activeType);
  const canExport = features.export && perms.has('export.data');

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">Sotuvlar</h1>
          <p className="t-page-sub ux-hide-mobile">
            Bugun: <strong>{todaySales} ta</strong> · Qarzdorlik: <strong>{fmtMoney(debtTotal[0]?.total ?? 0)} so&apos;m</strong>
          </p>
        </div>
        <div className="t-page-actions sl-list-actions">
          <Link href="/app/sales/new" className="btn btn-primary btn-with-icon ux-hide-mobile">
            <Icon name="plus" size={16} />
            Yangi sotuv
          </Link>
          {canExport && (
            <MoreMenu label="Sotuvlar bo'yicha boshqa amallar">
              <a href="/api/export/sales">
                <Icon name="download" size={18} />
                CSV yuklab olish
              </a>
            </MoreMenu>
          )}
        </div>
      </div>

      <section className="ux-strip sl-strip" aria-label="Sotuvlar xulosasi">
        <Tilt className="sl-stat sl-stat--hero" max={5}>
          <span className="sl-stat-l"><Icon name="trendingUp" size={16} />Bugun</span>
          <span className="sl-stat-v ux-z">{fmtMoney(today.sum)} <small>so&apos;m</small></span>
          <span className="sl-stat-d">{todaySales} ta sotuv</span>
        </Tilt>
        <div className="sl-stat">
          <span className="sl-stat-l"><span className="ux-clay sl-clay" aria-hidden><Icon name="chart" size={16} /></span>So&apos;nggi 7 kun</span>
          <span className="sl-stat-v">{fmtMoney(week.sum)} <small>so&apos;m</small></span>
          <span className="sl-stat-d">{week.n} ta sotuv</span>
        </div>
        <div className="sl-stat">
          <span className="sl-stat-l"><span className="ux-clay ux-clay--green sl-clay" aria-hidden><Icon name="cart" size={16} /></span>Jami</span>
          <span className="sl-stat-v">{fmtMoney(all.sum)} <small>so&apos;m</small></span>
          <span className="sl-stat-d">{all.n} ta sotuv</span>
        </div>
        <Link
          href={href('partial', activeType)}
          className="sl-stat sl-stat--gold sl-stat--link"
          aria-label={`Qarzdorlik: ${fmtMoney(debtTotal[0]?.total ?? 0)} so'm — qarzdor sotuvlarni ko'rsatish`}
        >
          <span className="sl-stat-l"><span className="ux-clay ux-clay--gold sl-clay" aria-hidden><Icon name="wallet" size={16} /></span>Qarzdorlik</span>
          <span className="sl-stat-v">{fmtMoney(debtTotal[0]?.total ?? 0)} <small>so&apos;m</small></span>
          <span className="sl-stat-d">Qoldiq to&apos;lovlar</span>
        </Link>
      </section>

      <div className="sl-toolbar">
        <nav className="sl-seg" aria-label="Holat bo'yicha filtr">
          {STATUS_SEG.map((s) => (
            <Link
              key={s.label}
              href={href(s.key, activeType)}
              className="sl-seg-btn"
              aria-current={activeStatus === s.key ? 'page' : undefined}
            >
              {s.short ? (
                <>
                  <span className="ux-hide-mobile">{s.label}</span>
                  <span className="ux-only-mobile">{s.short}</span>
                </>
              ) : s.label}
            </Link>
          ))}
        </nav>
        <nav className="sl-chips ux-scrollx" aria-label="To'lov turi bo'yicha filtr">
          <Link href={href(activeStatus)} className="sl-chip" aria-current={!activeType ? 'page' : undefined}>
            Barcha turlar <b>{all.n}</b>
          </Link>
          {typeChips.map((t) => (
            <Link key={t} href={href(activeStatus, t)} className="sl-chip" aria-current={activeType === t ? 'page' : undefined}>
              {TYPE_SHORT[t]} <b>{typeCount[t] ?? 0}</b>
            </Link>
          ))}
        </nav>
      </div>

      <div className="sl-card sl-list-card">
        {rows.length === 0 ? (
          <div className="ux-empty sl-empty">
            <div className="ux-empty-ic"><Icon name="cart" size={28} /></div>
            <b>{filtered ? 'Bu filtr bo\'yicha sotuv yo\'q' : 'Hali sotuv yo\'q'}</b>
            <p>{filtered ? 'Boshqa holat yoki to\'lov turini tanlab ko\'ring.' : 'Birinchi sotuvni rasmiylashtiring — u shu yerda paydo bo\'ladi.'}</p>
            {filtered ? (
              <Link href="/app/sales" className="btn btn-ghost">Filtrni tozalash</Link>
            ) : (
              <Link href="/app/sales/new" className="btn btn-primary">Birinchi sotuvni qilish</Link>
            )}
          </div>
        ) : (
          <>
            <ul className="sl-list">
              {rows.map((r) => (
                <li key={r.id} className={`sl-row${r.cancelled ? ' sl-row--cancelled' : ''}`}>
                  <span className={`sl-av sl-av--${r.cancelled ? 'cancelled' : r.type}`} aria-hidden>{r.avatar}</span>
                  <div className="sl-row-main">
                    <div className="sl-row-top">
                      <Link href={`/app/sales/${r.id}`} className="sl-row-title">
                        {r.name}{r.qty > 1 ? ` × ${r.qty}` : ''}
                      </Link>
                      <span className={`sl-pill sl-pill--${r.cancelled ? 'cancelled' : r.type}`}>
                        {r.cancelled ? 'Bekor qilingan' : TYPE_SHORT[r.type]}
                      </span>
                    </div>
                    {/* Asosiy 2-qator: mijoz · sana. Qolgani (raqam, filial, IMEI, rang) faqat keng ekranda */}
                    <div className="sl-row-meta">
                      <span className="sl-row-who">{r.customer || r.saleNo}</span>
                      <span>{r.date}</span>
                      {r.customer && <span className="sl-row-x">{r.saleNo}</span>}
                      <span className="sl-row-x">{r.source}</span>
                      {r.imei && <code className="sl-row-x">{r.imei}</code>}
                      {r.color && <span className="sl-row-x">{r.color}</span>}
                      {r.note && <span className="sl-row-x sl-row-note" title={r.note}>{r.note}</span>}
                    </div>
                  </div>
                  <div className="sl-row-amt">
                    <strong>{fmtMoney(r.total)} <small>so&apos;m</small></strong>
                    {!r.cancelled && r.remaining > 0 ? (
                      <span className="sl-rem">Qoldiq {fmtMoney(r.remaining)}</span>
                    ) : r.qty > 1 ? (
                      <span>{r.qty} × {fmtMoney(r.unit)}</span>
                    ) : null}
                    {canViewCost && <span className="sl-row-x">Olingan: {fmtMoney(r.purchase)}</span>}
                  </div>
                </li>
              ))}
            </ul>
            {rows.length >= 200 && (
              <p className="sl-foot-note">
                Oxirgi 200 ta sotuv ko&apos;rsatilmoqda.{canExport ? ' To\'liq ro\'yxat uchun CSV yuklab oling (⋯ menyusi).' : ''}
              </p>
            )}
          </>
        )}
      </div>

      <Link href="/app/sales/new" className="ux-fab">
        <Icon name="plus" size={20} />
        Yangi sotuv
      </Link>
    </>
  );
}
